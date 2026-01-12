const KNOWN_PLACES: Record<string, { lat: number; lng: number }> = {
  etterbeek: { lat: 50.8281, lng: 4.3869 },
  ixelles: { lat: 50.8277, lng: 4.3661 },
  'ephec louvain-la-neuve': { lat: 50.6686, lng: 4.6145 },
  'ephec delta': { lat: 50.8205, lng: 4.4025 },
  'ephec woluwe': { lat: 50.8456, lng: 4.4585 },
  'ephec woluwé': { lat: 50.8471, lng: 4.4513 },
  'ephec schaerbeek': { lat: 50.8726, lng: 4.3816 },
  'uclouvain': { lat: 50.6678, lng: 4.6144 },
  'ulb - solbosch': { lat: 50.8122, lng: 4.3817 },
  wavre: { lat: 50.7176, lng: 4.6019 },
  schaerbeek: { lat: 50.8671, lng: 4.3774 },
};

const BOUNDS = {
  minLat: 50.60,
  maxLat: 50.95,
  minLng: 4.2,
  maxLng: 4.75,
};

const normaliseKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .toLowerCase();

const fallbackCoordinate = (value: string) => {
  const key = normaliseKey(value);
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const latRange = BOUNDS.maxLat - BOUNDS.minLat;
  const lngRange = BOUNDS.maxLng - BOUNDS.minLng;
  const lat = BOUNDS.minLat + ((hash >>> 0) % 1000) / 1000 * latRange;
  const lng = BOUNDS.minLng + (((hash >>> 7) % 1000) / 1000) * lngRange;
  return { lat, lng };
};

const resolve = (value: string) => {
  const key = normaliseKey(value);
  const direct = KNOWN_PLACES[key];
  const matchKey = direct
    ? null
    : Object.keys(KNOWN_PLACES).find(
        (known) => key.includes(known) || known.includes(key)
      );
  const base =
    direct ?? (matchKey ? KNOWN_PLACES[matchKey as keyof typeof KNOWN_PLACES] : fallbackCoordinate(value));
  return { lat: base.lat, lng: base.lng, latitude: base.lat, longitude: base.lng };
};

const toUnit = (lat: number, lng: number) => {
  const x = (lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng);
  const y = 1 - (lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat);
  return {
    x: Math.min(0.98, Math.max(0.02, x)),
    y: Math.min(0.98, Math.max(0.02, y)),
  };
};

export const computePath = (from: string, to: string) => {
  const startCoord = resolve(from);
  const endCoord = resolve(to);
  return {
    start: toUnit(startCoord.lat, startCoord.lng),
    end: toUnit(endCoord.lat, endCoord.lng),
  };
};

const toRad = (value: number) => (value * Math.PI) / 180;

export const getCoordinates = (place: string) => resolve(place);

export const distanceKm = (from: string, to: string) => {
  const a = resolve(from);
  const b = resolve(to);
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const hav =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
  return Math.round(R * c * 10) / 10;
};
