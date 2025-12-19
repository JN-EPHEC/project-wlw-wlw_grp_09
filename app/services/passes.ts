import { addPoints, grantRideCredits, payWithWallet, recordWalletActivity } from './wallet';

export type PaymentChannel = 'wallet' | 'card';

export type RidePack = {
  id: string;
  label: string;
  description: string;
  rides: number;
  price: number;
  bonusPoints: number;
  highlight?: string;
};

export type PackPurchase = {
  id: string;
  packId: string;
  rides: number;
  price: number;
  paidWith: PaymentChannel;
  createdAt: number;
};

const PACKS: RidePack[] = [
  {
    id: 'starter-5',
    label: 'Pack Starter',
    description: '5 trajets, idéal pour tester CampusRide',
    rides: 5,
    price: 11.5,
    bonusPoints: 25,
  },
  {
    id: 'weekly-10',
    label: 'Pack Hebdo',
    description: '10 trajets avec 5% de réduction',
    rides: 10,
    price: 21.5,
    bonusPoints: 60,
    highlight: 'Le plus populaire',
  },
  {
    id: 'commuter-20',
    label: 'Pack Commuter',
    description: '20 trajets pour les allers-retours réguliers',
    rides: 20,
    price: 40,
    bonusPoints: 140,
  },
];

const purchases: Record<string, PackPurchase[]> = {};

const randomId = () => Math.random().toString(36).slice(2, 11);

export const listRidePacks = () => PACKS.map((pack) => ({ ...pack }));

export const getPassengerPacks = (email: string) => {
  const key = email.toLowerCase();
  return (purchases[key] ?? []).map((item) => ({ ...item }));
};

export const purchasePack = (
  email: string,
  packId: string,
  channel: PaymentChannel = 'card'
) => {
  const key = email.toLowerCase();
  const pack = PACKS.find((item) => item.id === packId);
  if (!pack) {
    return { ok: false as const, reason: 'not-found' as const };
  }
  if (channel === 'wallet') {
    const debitResult = payWithWallet(
      key,
      pack.price,
      `Pack ${pack.label}`,
      { type: 'ride-pack', packId: pack.id }
    );
    if (!debitResult) {
      return { ok: false as const, reason: 'insufficient-wallet' as const };
    }
  } else {
    recordWalletActivity(key, `Pack ${pack.label} payé par carte`, {
      type: 'ride-pack',
      packId: pack.id,
      paidWith: 'card',
    });
  }

  grantRideCredits(key, pack.rides, { packId: pack.id, label: pack.label });
  if (pack.bonusPoints > 0) {
    addPoints(key, pack.bonusPoints, `Achat ${pack.label}`);
  }

  if (!purchases[key]) purchases[key] = [];
  const purchase: PackPurchase = {
    id: randomId(),
    packId: pack.id,
    rides: pack.rides,
    price: pack.price,
    paidWith: channel,
    createdAt: Date.now(),
  };
  purchases[key] = [purchase, ...(purchases[key] ?? [])].slice(0, 50);

  return { ok: true as const, pack: { ...pack }, purchase };
};
