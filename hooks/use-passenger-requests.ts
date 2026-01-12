import { useEffect, useState } from 'react';

import {
  subscribeReservationRequests,
  type ReservationRequestEntry,
} from '@/app/services/reservation-requests';

export const usePassengerRequests = (email: string | null) => {
  const [requests, setRequests] = useState<ReservationRequestEntry[]>([]);

  useEffect(() => {
    if (!email) {
      setRequests([]);
      return;
    }
    const unsubscribe = subscribeReservationRequests(email, setRequests);
    return unsubscribe;
  }, [email]);

  return {
    pending: requests.filter((request) => request.status === 'pending'),
    accepted: requests.filter((request) => request.status === 'accepted'),
  };
};
