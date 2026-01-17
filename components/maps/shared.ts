import type { Coordinates } from './types';

export type HeroSegment = {
  id: string;
  start: Coordinates;
  end: Coordinates;
  startLabel: string;
  endLabel: string;
};

export type HeroLatLng = { lat: number; lng: number };
export type HeroPreviewMarker = { position: HeroLatLng; label: string; kind: 'origin' | 'destination' };

export const DEFAULT_HERO_REGION: Coordinates & { latitudeDelta: number; longitudeDelta: number } = {
  latitude: 50.8503,
  longitude: 4.3517,
  latitudeDelta: 0.35,
  longitudeDelta: 0.45,
};

export const computeRegionFromPoints = (points: Coordinates[]): typeof DEFAULT_HERO_REGION => {
  if (points.length === 0) {
    return DEFAULT_HERO_REGION;
  }
  const lats = points.map((point) => point.latitude);
  const lngs = points.map((point) => point.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLng + maxLng) / 2;
  const latitudeDelta = Math.max((maxLat - minLat) * 1.6, 0.1);
  const longitudeDelta = Math.max((maxLng - minLng) * 1.6, 0.1);
  return { latitude, longitude, latitudeDelta, longitudeDelta };
};

export const HERO_FALLBACK_SEGMENTS: HeroSegment[] = [
  {
    id: 'hero-fallback-1',
    start: { latitude: 50.8467, longitude: 4.3517 },
    end: { latitude: 50.8794, longitude: 4.7009 },
    startLabel: 'Grand-Place',
    endLabel: 'Leuven',
  },
];

export const HERO_FALLBACK_POINTS: Coordinates[] = HERO_FALLBACK_SEGMENTS.flatMap((segment) => [
  { latitude: segment.start.latitude, longitude: segment.start.longitude },
  { latitude: segment.end.latitude, longitude: segment.end.longitude },
]);

export const toHeroCoordinates = (point: HeroLatLng) => ({
  latitude: point.lat,
  longitude: point.lng,
});

export const HERO_DESTINATION_PIN_SVG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="48" viewBox="0 0 32 48"><path fill="%23D93025" stroke="%23A52714" stroke-width="2" d="M16 1C8.82 1 3 6.82 3 14c0 9.5 13 24 13 24s13-14.5 13-24C29 6.82 23.18 1 16 1z"/><circle cx="16" cy="15" r="6" fill="%23FFFFFF"/></svg>';
export const HERO_DESTINATION_PIN_SIZE = { width: 24, height: 36 };

export const isValidHeroCoordinate = (coord: Coordinates | null | undefined) =>
  !!coord && Number.isFinite(coord.latitude) && Number.isFinite(coord.longitude);

export const sanitizeHeroSegments = (segments: HeroSegment[]): HeroSegment[] =>
  segments.filter((segment) => isValidHeroCoordinate(segment.start) && isValidHeroCoordinate(segment.end));

export const computeHeroCamera = (segments: HeroSegment[]) => {
  const validSegments = sanitizeHeroSegments(segments);
  if (validSegments.length === 0) {
    return { center: { lat: 50.8503, lng: 4.3517 }, zoom: 11 };
  }
  const lats = validSegments.flatMap((segment) => [segment.start.latitude, segment.end.latitude]);
  const lngs = validSegments.flatMap((segment) => [segment.start.longitude, segment.end.longitude]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  const latitudeDelta = Math.max((maxLat - minLat) * 1.4, 0.02);
  const longitudeDelta = Math.max((maxLng - minLng) * 1.4, 0.02);
  const delta = Math.max(latitudeDelta, longitudeDelta);
  const zoom = Math.max(5, Math.min(15, Math.log2(360 / delta)));
  return { center, zoom };
};
