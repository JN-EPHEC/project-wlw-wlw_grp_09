// app/services/pricing.ts
import {
  CAMPUSRIDE_COMMISSION_RATE,
  MAINTENANCE_EUROS_PER_KM,
  getFuelContext,
  type FuelType,
} from '@/app/constants/fuel';

export type PriceQuote = {
  distanceKm: number;
  seats: number;
  fuelCost: number;
  maintenanceCost: number;
  baseCostPerPassenger: number;
  commissionPerPassenger: number;
  recommendedFarePerPassenger: number;
  driverTakeHomePerPassenger: number;
  recommendedFareForRide: number;
  assumptions: {
    fuelType: FuelType;
    fuelPricePerLitre: number;
    consumptionPer100Km: number;
    maintenancePerKm: number;
    commissionRate: number;
  };
};

type EstimateOptions = {
  seats?: number;
  fuelType?: FuelType;
  commissionRate?: number;
};

const roundFare = (value: number) => Math.round(value * 20) / 20; // nearest 0.05 €

export const estimatePrice = (km: number, options: EstimateOptions = {}): PriceQuote => {
  const distanceKm = Math.max(1, km);
  const seats = Math.max(1, Math.min(4, Math.round(options.seats ?? 1)));
  const fuelType = options.fuelType ?? 'e10';
  const fuel = getFuelContext(fuelType);
  const commissionRate = options.commissionRate ?? CAMPUSRIDE_COMMISSION_RATE;
  const fuelCost =
    (fuel.consumptionPer100Km / 100) * distanceKm * fuel.pricePerLitre;
  const maintenanceCost = distanceKm * MAINTENANCE_EUROS_PER_KM;
  const totalBaseCost = fuelCost + maintenanceCost;
  const baseCostPerPassenger = totalBaseCost / seats;
  const commissionPerPassenger = baseCostPerPassenger * commissionRate;
  const recommendedFarePerPassenger = roundFare(baseCostPerPassenger + commissionPerPassenger);
  const driverTakeHomePerPassenger = recommendedFarePerPassenger - commissionPerPassenger;

  return {
    distanceKm,
    seats,
    fuelCost: +fuelCost.toFixed(2),
    maintenanceCost: +maintenanceCost.toFixed(2),
    baseCostPerPassenger: +baseCostPerPassenger.toFixed(2),
    commissionPerPassenger: +commissionPerPassenger.toFixed(2),
    recommendedFarePerPassenger,
    driverTakeHomePerPassenger: +driverTakeHomePerPassenger.toFixed(2),
    recommendedFareForRide: +(recommendedFarePerPassenger * seats).toFixed(2),
    assumptions: {
      fuelType,
      fuelPricePerLitre: fuel.pricePerLitre,
      consumptionPer100Km: fuel.consumptionPer100Km,
      maintenancePerKm: MAINTENANCE_EUROS_PER_KM,
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
  const min = Math.max(1, roundFare(base * 0.75));
  const max = roundFare(Math.max(min + 0.5, base * 1.6));
  const double = roundFare(base * 1.9);
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
