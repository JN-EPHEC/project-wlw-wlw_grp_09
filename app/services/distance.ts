import {
  computePath,
  getCoordinates as fallbackGetCoordinates,
  distanceKm as fallbackDistanceKm,
} from './geo';

export type DistanceProvider = {
  distanceKm: (from: string, to: string) => number;
  durationMinutes?: (from: string, to: string) => number | null;
};

const normalize = (value: string) => value.trim().toLowerCase();

const DURATION_PRESETS = [
  { from: 'schaerbeek', to: 'ephec woluwe', minutes: 14 },
  { from: 'jette', to: 'ephec woluwe', minutes: 21 },
  { from: 'ixelles', to: 'ephec woluwe', minutes: 18 },
  { from: 'ixelles', to: 'ephec delta', minutes: 13 },
  { from: 'ixelles', to: 'ephec lln', minutes: 43 },
  { from: 'ixelles', to: 'ephec schaerbeek', minutes: 20 },
  { from: 'parc du cinquantenaire', to: 'ephec woluwe', minutes: 11 },
  { from: 'parc du cinquantenaire', to: 'ephec delta', minutes: 9 },
  { from: 'parc du cinquantenaire', to: 'ephec lln', minutes: 37 },
  { from: 'parc du cinquantenaire', to: 'ephec schaerbeek', minutes: 15 },
  { from: 'jette', to: 'ephec delta', minutes: 23 },
  { from: 'jette', to: 'ephec lln', minutes: 48 },
  { from: 'jette', to: 'ephec schaerbeek', minutes: 16 },
  { from: 'schaerbeek', to: 'ephec delta', minutes: 19 },
  { from: 'schaerbeek', to: 'ephec lln', minutes: 44 },
];

const DURATION_OVERRIDES: Record<string, number> = DURATION_PRESETS.reduce((acc, { from, to, minutes }) => {
  const key = `${normalize(from)}|${normalize(to)}`;
  acc[key] = minutes;
  acc[`${normalize(to)}|${normalize(from)}`] = minutes;
  return acc;
}, {} as Record<string, number>);

type Provider = {
  distanceKm: (from: string, to: string) => number;
  durationMinutes?: (from: string, to: string) => number | null;
};

let provider: Provider = {
  distanceKm: fallbackDistanceKm,
};

export const setDistanceProvider = (next: Partial<DistanceProvider>) => {
  provider = {
    distanceKm: next.distanceKm ?? fallbackDistanceKm,
    durationMinutes: next.durationMinutes,
  };
};

export const resetDistanceProvider = () => {
  provider = { distanceKm: fallbackDistanceKm };
};

export const getDistanceKm = (from: string, to: string) => provider.distanceKm(from, to);

export const getDurationMinutes = (from: string, to: string) => {
  const fn = provider.durationMinutes;
  if (fn) {
    const result = fn(from, to);
    if (result == null) return null;
    return Math.max(1, Math.round(result));
  }
  const override = DURATION_OVERRIDES[`${normalize(from)}|${normalize(to)}`];
  if (override) {
    return override;
  }
  const distance = provider.distanceKm(from, to);
  const AVERAGE_SPEED_KMH = 38;
  const minutes = (distance / AVERAGE_SPEED_KMH) * 60;
  if (!Number.isFinite(minutes)) return null;
  return Math.max(1, Math.round(minutes));
};

export const getCoordinates = (place: string) => fallbackGetCoordinates(place);

export { computePath };
