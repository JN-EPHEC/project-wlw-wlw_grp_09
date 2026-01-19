import { useEffect, useState } from 'react';

import {
  subscribeDriverReservationRequests,
  type ReservationRequestEntry,
} from '@/app/services/firestore-reservation-requests';

export const useDriverRequests = (driverUid: string | null) => {
  const [requests, setRequests] = useState<ReservationRequestEntry[]>([]);

  useEffect(() => {
    if (!driverUid) {
      setRequests([]);
      return;
    }
    const unsubscribe = subscribeDriverReservationRequests(driverUid, setRequests);
    return unsubscribe;
  }, [driverUid]);

  return {
    pending: requests.filter((request) => request.requestStatus === 'pending'),
    accepted: requests.filter((request) => request.requestStatus === 'accepted'),
    paid: requests.filter((request) => request.requestStatus === 'paid'),
    rejected: requests.filter((request) => request.requestStatus === 'rejected'),
  };
};
