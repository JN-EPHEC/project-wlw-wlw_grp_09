import { useEffect, useState } from 'react';

import { getUserDocuments, subscribeUserDocuments } from '@/src/firestoreUsers';

type DocumentPayload = {
  driverLicenseRecto?: string | null;
  driverLicenseVerso?: string | null;
  studentCard?: string | null;
};

export const useUserDocuments = (email: string | null | undefined) => {
  const [documents, setDocuments] = useState<DocumentPayload | null>(null);

  useEffect(() => {
    if (!email) {
      setDocuments(null);
      return;
    }

    let isActive = true;
    const load = async () => {
      try {
        const snapshot = await getUserDocuments(email);
        if (isActive) {
          setDocuments(snapshot);
        }
      } catch (error) {
        console.warn('Failed to load user documents', error);
      }
    };
    load();

    const unsubscribe = subscribeUserDocuments(email, (payload) => {
      if (isActive) {
        setDocuments(payload);
      }
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [email]);

  return documents;
};
