// app/services/platform.ts
// Agrège les revenus CampusRide pour pilotage interne.

type RevenueEntry = {
  id: string;
  rideId: string;
  amount: number;
  createdAt: number;
  description: string;
  metadata?: Record<string, unknown>;
};

let totalCommission = 0;
const entries: RevenueEntry[] = [];

const randomId = () => Math.random().toString(36).slice(2, 11);

export const recordCommission = (
  rideId: string,
  amount: number,
  metadata?: Record<string, unknown>
) => {
  if (amount <= 0) return null;
  totalCommission += amount;
  const entry: RevenueEntry = {
    id: randomId(),
    rideId,
    amount,
    createdAt: Date.now(),
    description: 'Commission CampusRide',
    metadata,
  };
  entries.unshift(entry);
  if (entries.length > 100) entries.length = 100;
  return entry;
};

export const getPlatformRevenue = () => ({
  total: +(totalCommission.toFixed(2)),
  latest: entries.map((item) => ({ ...item })),
});

export const resetPlatformRevenue = () => {
  totalCommission = 0;
  entries.length = 0;
};
