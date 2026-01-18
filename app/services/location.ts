import { Platform } from 'react-native';
import * as Location from 'expo-location';

import { BRUSSELS_COMMUNES } from '@/constants/communes';

export class LocationPermissionError extends Error {
  constructor() {
    super('permission-denied');
  }
}

export class LocationUnavailableError extends Error {
  constructor() {
    super('location-unavailable');
  }
}

export type LatLng = {
  lat: number;
  lng: number;
};

const isValidCoordinate = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value);

export const toLatLng = (
  coords: { latitude?: number | null; longitude?: number | null } | null | undefined
): LatLng | null => {
  if (!coords) {
    return null;
  }
  const lat = coords.latitude;
  const lng = coords.longitude;
  if (!isValidCoordinate(lat) || !isValidCoordinate(lng)) {
    return null;
  }
  return { lat, lng };
};

const FALLBACK_COMMUNE = 'Bruxelles-Ville';

type ResolvedPlace = Location.LocationGeocodedAddress | { formatted_address?: string | null };

type ResolvedLocation = {
  commune: string;
  coords: Location.LocationObjectCoords;
  latLng: LatLng;
  address: string;
};

const normalise = (value: string | null | undefined) =>
  value ? value.trim().toLowerCase() : '';

const COMMUNE_ALIASES: Record<string, string> = {
  bruxelles: 'Bruxelles-Ville',
  brussels: 'Bruxelles-Ville',
  'ville de bruxelles': 'Bruxelles-Ville',
  'city of brussels': 'Bruxelles-Ville',
  brussel: 'Bruxelles-Ville',
  elsene: 'Ixelles',
  schaarbeek: 'Schaerbeek',
  'sint-joost-ten-node': 'Saint-Josse-ten-Noode',
  'sint-jans-molenbeek': 'Molenbeek-Saint-Jean',
  'sint-gillis': 'Saint-Gilles',
  ukkel: 'Uccle',
  oudergem: 'Auderghem',
  'watermaal-bosvoorde': 'Watermael-Boitsfort',
  'sint-lambrechts-woluwe': 'Woluwe-Saint-Lambert',
  'sint-pieters-woluwe': 'Woluwe-Saint-Pierre',
  vorst: 'Forest',
};

const resolveCommuneName = (candidate: string | null | undefined): string | null => {
  const key = normalise(candidate);
  if (!key) {
    return null;
  }

  const match = BRUSSELS_COMMUNES.find((commune) =>
    key === normalise(commune) || key.includes(normalise(commune))
  );
  if (match) {
    return match;
  }

  for (const alias of Object.keys(COMMUNE_ALIASES)) {
    if (key.includes(alias)) {
      return COMMUNE_ALIASES[alias];
    }
  }

  return null;
};

const POSTAL_CODE_COMMUNES: Record<string, string> = {
  '1000': 'Bruxelles-Ville',
  '1020': 'Bruxelles-Ville',
  '1030': 'Schaerbeek',
  '1040': 'Etterbeek',
  '1050': 'Ixelles',
  '1060': 'Saint-Gilles',
  '1070': 'Anderlecht',
  '1080': 'Molenbeek-Saint-Jean',
  '1081': 'Koekelberg',
  '1082': 'Berchem-Sainte-Agathe',
  '1083': 'Ganshoren',
  '1090': 'Jette',
  '1120': 'Bruxelles-Ville',
  '1130': 'Bruxelles-Ville',
  '1140': 'Evere',
  '1150': 'Woluwe-Saint-Pierre',
  '1160': 'Auderghem',
  '1170': 'Watermael-Boitsfort',
  '1180': 'Uccle',
  '1190': 'Forest',
  '1200': 'Woluwe-Saint-Lambert',
  '1210': 'Saint-Josse-ten-Noode',
};

const resolveCommuneFromPlace = (
  place: Location.LocationGeocodedAddress | undefined
): string => {
  if (!place) {
    return FALLBACK_COMMUNE;
  }

  if (place.postalCode) {
    const digits = place.postalCode.match(/\d{4}/)?.[0];
    const normalized = digits ?? place.postalCode.trim();
    const mapped = POSTAL_CODE_COMMUNES[normalized];
    if (mapped) {
      return mapped;
    }
  }

  const candidates = [
    place.name,
    place.street,
    place.district,
    place.city,
    place.subregion,
    place.region,
  ];

  for (const candidate of candidates) {
    const resolved = resolveCommuneName(candidate ?? null);
    if (resolved) {
      return resolved;
    }
  }

  const fallbackCandidate = candidates.find((candidate) => candidate && candidate.trim().length > 0);
  if (fallbackCandidate) {
    return fallbackCandidate.trim();
  }

  return FALLBACK_COMMUNE;
};

const formatStreetLine = (place: Location.LocationGeocodedAddress | undefined) => {
  if (!place) {
    return '';
  }
  const segments = [];
  if (place.name && place.name.trim().length > 0) {
    segments.push(place.name.trim());
  }
  if (place.street && place.street.trim().length > 0) {
    segments.push(place.street.trim());
  }
  if (place.streetNumber && place.streetNumber.trim().length > 0) {
    segments.push(place.streetNumber.trim());
  }
  return segments.join(' ').trim();
};

const formatLocalityLine = (place: Location.LocationGeocodedAddress | undefined) => {
  if (!place) {
    return '';
  }
  const segments = [];
  if (place.postalCode && place.postalCode.trim().length > 0) {
    segments.push(place.postalCode.trim());
  }
  if (place.city && place.city.trim().length > 0) {
    segments.push(place.city.trim());
  }
  if (place.region && place.region.trim().length > 0) {
    segments.push(place.region.trim());
  }
  return segments.join(' ').trim();
};

const formatCountryLine = (place: Location.LocationGeocodedAddress | undefined) => {
  if (!place) {
    return '';
  }
  const country = place.country?.trim();
  return country && country.length > 0 ? country : '';
};

const buildMinimalAddress = (place?: ResolvedPlace | null) => {
  if (!place) {
    return '';
  }
  const streetParts: string[] = [];
  if (place.street && place.street.trim().length > 0) {
    streetParts.push(place.street.trim());
  }
  if (place.streetNumber && place.streetNumber.trim().length > 0) {
    streetParts.push(place.streetNumber.trim());
  }
  const streetLine = streetParts.join(' ').trim();

  const localityParts: string[] = [];
  if (place.postalCode && place.postalCode.trim().length > 0) {
    localityParts.push(place.postalCode.trim());
  }
  if (place.city && place.city.trim().length > 0) {
    localityParts.push(place.city.trim());
  }
  const localityLine = localityParts.join(' ').trim();

  const segments = [];
  if (streetLine) {
    segments.push(streetLine);
  }
  if (localityLine) {
    segments.push(localityLine);
  }
  return segments.join(', ').trim();
};

export const formatLocationAddress = (place?: ResolvedPlace | null): string => {
  if (!place) {
    return '';
  }
  if ('formatted_address' in place && place.formatted_address) {
    return place.formatted_address.trim();
  }
  const expoPlace = place as Location.LocationGeocodedAddress;
  const parts = [];
  const streetLine = formatStreetLine(expoPlace);
  if (streetLine) {
    parts.push(streetLine);
  }
  const localityLine = formatLocalityLine(expoPlace);
  if (localityLine) {
    parts.push(localityLine);
  }
  const countryLine = formatCountryLine(expoPlace);
  if (countryLine) {
    parts.push(countryLine);
  }
  return parts.join(', ').trim();
};

export const reverseGeocodeToAddress = async (latLng: LatLng): Promise<string | null> => {
  if (!latLng || !isValidCoordinate(latLng.lat) || !isValidCoordinate(latLng.lng)) {
    return null;
  }

  if (Platform.OS === 'web') {
    const googleAny = globalThis as typeof globalThis & { google?: any };
    if (!googleAny.google?.maps?.Geocoder) {
      return null;
    }
    return new Promise<string | null>((resolve) => {
      const geocoder = new googleAny.google.maps.Geocoder();
      geocoder.geocode({ location: { lat: latLng.lat, lng: latLng.lng } }, (results: any, status: string) => {
        if (status !== 'OK' || !results || !results.length) {
          resolve(null);
          return;
        }
        const formatted = results[0]?.formatted_address;
        resolve(typeof formatted === 'string' ? formatted.trim() : null);
      });
    });
  }

  try {
    const places = await Location.reverseGeocodeAsync({
      latitude: latLng.lat,
      longitude: latLng.lng,
    });
    const place = places?.[0];
    const formatted = formatLocationAddress(place);
    const minimal = buildMinimalAddress(place);
    const resolved = (formatted || minimal).trim();
    return resolved.length > 0 ? resolved : null;
  } catch {
    return null;
  }
};

export const getCurrentCommune = async (): Promise<ResolvedLocation> => {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== Location.PermissionStatus.GRANTED) {
    throw new LocationPermissionError();
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Platform.select({
      ios: Location.Accuracy.Balanced,
      android: Location.Accuracy.Balanced,
      default: Location.Accuracy.Low,
    }),
    mayShowUserSettingsDialog: true,
    timeInterval: 2000,
  });

  if (!position?.coords) {
    throw new LocationUnavailableError();
  }

  const places = await Location.reverseGeocodeAsync(position.coords);
  const commune = resolveCommuneFromPlace(places[0]);
  const formattedAddress = formatLocationAddress(places[0]);
  const minimalAddress = buildMinimalAddress(places[0]);
  const stableAddress = (formattedAddress || minimalAddress).trim();
  const address = stableAddress.length > 0 ? stableAddress : 'Position actuelle';
  const latLng = toLatLng(position.coords);
  if (!latLng) {
    throw new LocationUnavailableError();
  }

  return { commune, coords: position.coords, address, latLng };
};
