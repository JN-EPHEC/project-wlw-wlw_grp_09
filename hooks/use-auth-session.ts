import { useEffect, useState } from 'react';

import * as Auth from '@/app/services/auth';

export const useAuthSession = () => {
  const [session, setSession] = useState(Auth.getSession());

  useEffect(() => {
    const unsubscribe = Auth.subscribe(setSession);
    return unsubscribe;
  }, []);

  return session;
};
