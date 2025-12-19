import { useEffect, useState } from 'react';

import {
  DriverSecuritySnapshot,
  getDriverSecurity,
  subscribeDriverSecurity,
} from '@/app/services/security';

export const useDriverSecurity = (email: string | null | undefined) => {
  const [security, setSecurity] = useState<DriverSecuritySnapshot | null>(() =>
    email ? getDriverSecurity(email) : null
  );

  useEffect(() => {
    if (!email) {
      setSecurity(null);
      return;
    }
    setSecurity(getDriverSecurity(email));
    const unsubscribe = subscribeDriverSecurity(email, setSecurity);
    return unsubscribe;
  }, [email]);

  return security;
};
