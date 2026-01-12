// app/services/pricing.ts
import { CAMPUSRIDE_COMMISSION_RATE } from '@/app/constants/fuel';

export type PriceQuote = {
  distanceKm: number;
  seats: number;
  distanceFarePerPassenger: number;
  commissionPerPassenger: number;
  recommendedFarePerPassenger: number;
  driverTakeHomePerPassenger: number;
  recommendedFareForRide: number;
  assumptions: {
    ratePerKm: number;
    commissionRate: number;
  };
};

type EstimateOptions = {
  seats?: number;
  commissionRate?: number;
};

const roundFare = (value: number) => Math.round(value * 20) / 20; // nearest 0.05 €
const RATE_PER_KM = 0.4;

export const estimatePrice = (km: number, options: EstimateOptions = {}): PriceQuote => {
  const distanceKm = Math.max(1, km);
  const seats = Math.max(1, Math.min(4, Math.round(options.seats ?? 1)));
  const commissionRate = options.commissionRate ?? CAMPUSRIDE_COMMISSION_RATE;
  const distanceFarePerPassenger = roundFare(distanceKm * RATE_PER_KM);
  const commissionPerPassenger = +(distanceFarePerPassenger * commissionRate).toFixed(2);
  const recommendedFarePerPassenger = distanceFarePerPassenger;
  const driverTakeHomePerPassenger = +(recommendedFarePerPassenger - commissionPerPassenger).toFixed(2);

  return {
    distanceKm,
    seats,
    distanceFarePerPassenger,
    commissionPerPassenger: +commissionPerPassenger.toFixed(2),
    recommendedFarePerPassenger,
    driverTakeHomePerPassenger: +driverTakeHomePerPassenger.toFixed(2),
    recommendedFareForRide: +(recommendedFarePerPassenger * seats).toFixed(2),
    assumptions: {
      ratePerKm: RATE_PER_KM,
      commissionRate,
    },
  };
};

export const roughKmFromText = (from: string, to: string) => {
  const cleanedFrom = from.trim().toLowerCase();
  const cleanedTo = to.trim().toLowerCase();
  if (!cleanedFrom || !cleanedTo) return 2;
  if (cleanedFrom === cleanedTo) return 2;
  const distanceBias = Math.abs(cleanedFrom.length - cleanedTo.length);
  const base = 4 + distanceBias;
  return Math.max(2, Math.min(60, base));
};

export const buildPriceBand = (km: number, seats = 3) => {
  const quote = estimatePrice(km, { seats });
  const base = quote.recommendedFarePerPassenger;
  const min = base;
  const max = base;
  const double = roundFare(base * 2);
  return {
    quote,
    min,
    max,
    suggested: base,
    double,
  };
};

export const clampPriceToBand = (price: number, km: number, seats = 3) => {
  const band = buildPriceBand(km, seats);
  return Math.min(band.max, Math.max(band.min, roundFare(price)));
};
