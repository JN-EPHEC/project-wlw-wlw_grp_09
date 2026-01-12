import { useEffect, useState } from 'react';

import { subscribeBlockedUsers, type BlockListener, getBlockedUsersSnapshot } from '@/app/services/blocked-users';

export const useBlockedUsers = (email: string | null | undefined) => {
  const [blocked, setBlocked] = useState<string[]>(() =>
    email ? getBlockedUsersSnapshot(email) : []
  );

  useEffect(() => {
    if (!email) {
      setBlocked([]);
      return;
    }
    const unsubscribe = subscribeBlockedUsers(email, setBlocked);
    return unsubscribe;
  }, [email]);

  return blocked;
};
