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

const FALLBACK_COMMUNE = 'Bruxelles-Ville';

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

type ResolvedLocation = {
  commune: string;
  coords: Location.LocationObjectCoords;
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

  return { commune, coords: position.coords };
};
