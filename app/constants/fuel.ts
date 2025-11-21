export type FuelType = 'e10' | 'diesel' | 'e5';

export type FuelSnapshot = {
  label: string;
  pricePerLitre: number;
  consumptionPer100Km: number;
};

const DATA: Record<FuelType, FuelSnapshot> = {
  e10: {
    label: 'Eurosuper 95 (E10)',
    pricePerLitre: 1.56,
    consumptionPer100Km: 6.2,
  },
  diesel: {
    label: 'Diesel B7',
    pricePerLitre: 1.66,
    consumptionPer100Km: 5.6,
  },
  e5: {
    label: 'Super 98 (E5)',
    pricePerLitre: 1.71,
    consumptionPer100Km: 6.0,
  },
};

let preferredFuel: FuelType = 'e10';

export const getFuelContext = (type: FuelType = preferredFuel) => DATA[type];

export const setPreferredFuel = (type: FuelType) => {
  preferredFuel = type;
};

export const getPreferredFuel = () => preferredFuel;

export const MAINTENANCE_EUROS_PER_KM = 0.05;

export const CAMPUSRIDE_COMMISSION_RATE = 0.15;

export const CAMPUSPOINTS_PER_PASSENGER = 12;
