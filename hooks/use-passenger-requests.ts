import { useEffect, useState } from 'react';

import {
  subscribeReservationRequests,
  type ReservationRequestEntry,
} from '@/app/services/firestore-reservation-requests';

export const usePassengerRequests = (passengerUid: string | null) => {
  const [requests, setRequests] = useState<ReservationRequestEntry[]>([]);

  useEffect(() => {
    if (!passengerUid) {
      setRequests([]);
      return;
    }
    const unsubscribe = subscribeReservationRequests(passengerUid, setRequests);
    return unsubscribe;
  }, [passengerUid]);

  return {
    requests,
    pending: requests.filter((request) => request.status === 'pending'),
    accepted: requests.filter((request) => request.status === 'accepted'),
    cancelled: requests.filter((request) => request.status === 'cancelled'),
  };
};
