import {
  computePath,
  getCoordinates as fallbackGetCoordinates,
  distanceKm as fallbackDistanceKm,
} from './geo';

export type DistanceProvider = {
  distanceKm: (from: string, to: string) => number;
  durationMinutes?: (from: string, to: string) => number | null;
};

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
  if (!fn) return null;
  const result = fn(from, to);
  if (result == null) return null;
  return Math.max(1, Math.round(result));
};

export const getCoordinates = (place: string) => fallbackGetCoordinates(place);

export { computePath };
