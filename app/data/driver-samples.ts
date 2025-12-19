import { ImageSourcePropType } from 'react-native';

import type { Ride } from '@/app/services/rides';

const getFutureDate = (daysAhead: number, hours: number, minutes: number) => {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hours, minutes, 0, 0);
  return date;
};

const formatRideTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString('fr-BE', {
    hour: '2-digit',
    minute: '2-digit',
  });

export type DisplayRide = Ride & {
  requests?: number;
  reservedSeats?: number;
};

const createSampleRide = ({
  id,
  depart,
  destination,
  departureAt,
  seats,
  price,
  requests,
  reservedSeats,
}: {
  id: string;
  depart: string;
  destination: string;
  departureAt: number;
  seats: number;
  price: number;
  requests: number;
  reservedSeats: number;
}): DisplayRide => ({
  id,
  driver: 'Eva AZOUZI',
  plate: 'CR-2024',
  depart,
  destination,
  time: formatRideTime(departureAt),
  seats,
  price,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ownerEmail: 'eva.azouzi@campusrides.be',
  passengers: new Array(reservedSeats).fill('demo@campusride.be'),
  canceledPassengers: [],
  departureAt,
  payoutProcessed: true,
  pricingMode: 'single',
  requests,
  reservedSeats,
});

export const FALLBACK_UPCOMING: DisplayRide[] = [
  createSampleRide({
    id: 'sample-upcoming-1',
    depart: 'Woluwe, Brussels',
    destination: 'EPHEC Louvain-la-Neuve',
    departureAt: getFutureDate(1, 9, 0).getTime(),
    seats: 4,
    price: 1.55,
    requests: 2,
    reservedSeats: 1,
  }),
  createSampleRide({
    id: 'sample-upcoming-2',
    depart: 'Brussels Centre',
    destination: 'EPHEC Louvain-la-Neuve',
    departureAt: getFutureDate(2, 7, 45).getTime(),
    seats: 3,
    price: 1.83,
    requests: 1,
    reservedSeats: 0,
  }),
];

export const FALLBACK_COMPLETED: DisplayRide[] = [
  createSampleRide({
    id: 'sample-completed-1',
    depart: 'Auderghem, Brussels',
    destination: 'EPHEC Woluwe',
    departureAt: getFutureDate(-3, 8, 15).getTime(),
    seats: 3,
    price: 1.2,
    requests: 0,
    reservedSeats: 2,
  }),
];

export type PendingRequest = {
  id: string;
  name: string;
  rating: number;
  trips: number;
  requestedAt: string;
  avatar: ImageSourcePropType;
};

export type ConfirmedPassenger = {
  id: string;
  name: string;
  rating: number;
  trips: number;
  avatar: ImageSourcePropType;
};

export const SAMPLE_PENDING_REQUESTS: PendingRequest[] = [
  {
    id: 'pending-1',
    name: 'Emma Petit',
    rating: 4.8,
    trips: 31,
    requestedAt: 'Demandé le 29 nov. à 09:15',
    avatar: { uri: 'https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=200&q=80' },
  },
  {
    id: 'pending-2',
    name: 'Thomas Dubois',
    rating: 4.6,
    trips: 12,
    requestedAt: 'Demandé le 29 nov. à 10:30',
    avatar: { uri: 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=200&q=80' },
  },
  {
    id: 'pending-3',
    name: 'Marie Leroy',
    rating: 5,
    trips: 45,
    requestedAt: 'Demandé le 29 nov. à 11:00',
    avatar: { uri: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=200&q=80' },
  },
];

export const SAMPLE_CONFIRMED_PASSENGERS: ConfirmedPassenger[] = [
  {
    id: 'confirmed-1',
    name: 'Sophie Martin',
    rating: 4.9,
    trips: 24,
    avatar: { uri: 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=200&q=80' },
  },
  {
    id: 'confirmed-2',
    name: 'Lucas Bernard',
    rating: 4.7,
    trips: 18,
    avatar: { uri: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=200&q=80' },
  },
];

export type RideDetail = {
  pendingRequests: PendingRequest[];
  confirmedPassengers: ConfirmedPassenger[];
};

export const SAMPLE_RIDE_DETAILS: Record<string, RideDetail> = {
  'sample-upcoming-1': {
    pendingRequests: SAMPLE_PENDING_REQUESTS,
    confirmedPassengers: SAMPLE_CONFIRMED_PASSENGERS,
  },
  'sample-upcoming-2': {
    pendingRequests: SAMPLE_PENDING_REQUESTS,
    confirmedPassengers: SAMPLE_CONFIRMED_PASSENGERS,
  },
};

export const getSampleRideDetail = (rideId: string): RideDetail => {
  return SAMPLE_RIDE_DETAILS[rideId] ?? {
    pendingRequests: SAMPLE_PENDING_REQUESTS,
    confirmedPassengers: SAMPLE_CONFIRMED_PASSENGERS,
  };
};
