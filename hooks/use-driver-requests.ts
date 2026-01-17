import { useEffect, useState } from 'react';

import {
  subscribeDriverReservationRequests,
  type ReservationRequestEntry,
} from '@/app/services/reservation-requests';

export const useDriverRequests = (email: string | null) => {
  const [requests, setRequests] = useState<ReservationRequestEntry[]>([]);

  useEffect(() => {
    if (!email) {
      setRequests([]);
      return;
    }
    const unsubscribe = subscribeDriverReservationRequests(email, setRequests);
    return unsubscribe;
  }, [email]);

  return {
    pending: requests.filter((request) => request.status === 'pending'),
    accepted: requests.filter((request) => request.status === 'accepted'),
    rejected: requests.filter((request) => request.status === 'rejected'),
  };
};
