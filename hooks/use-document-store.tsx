import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useAuthSession } from '@/hooks/use-auth-session';
import { useUserDocuments } from '@/hooks/use-user-documents';

export type SharedDocumentKey = 'studentCard' | 'licenseRecto' | 'licenseVerso';

export type SharedDocumentEntry = {
  uri: string;
  name: string;
};

type DocumentStoreState = Record<SharedDocumentKey, SharedDocumentEntry | null>;

type DocumentStoreContextValue = {
  documents: DocumentStoreState;
  setDocumentEntry: (key: SharedDocumentKey, entry: SharedDocumentEntry | null) => void;
};

const initialState: DocumentStoreState = {
  studentCard: null,
  licenseRecto: null,
  licenseVerso: null,
};

const DocumentStoreContext = createContext<DocumentStoreContextValue | undefined>(undefined);

export function DocumentStoreProvider({ children }: { children: ReactNode }) {
  const session = useAuthSession();
  const userDocuments = useUserDocuments(session.email);
  const [documents, setDocuments] = useState<DocumentStoreState>(initialState);

  const resetStore = useCallback(() => {
    setDocuments({ ...initialState });
  }, []);

  const setDocumentEntry = useCallback((key: SharedDocumentKey, entry: SharedDocumentEntry | null) => {
    setDocuments((previous) => {
      const current = previous[key];
      if (entry) {
        if (current?.uri === entry.uri) {
          return previous;
        }
        return { ...previous, [key]: entry };
      }
      if (current === null) {
        return previous;
      }
      return { ...previous, [key]: null };
    });
  }, []);

  useEffect(() => {
    resetStore();
  }, [resetStore, session.email]);

  useEffect(() => {
    if (userDocuments?.studentCard) {
      setDocumentEntry('studentCard', {
        uri: userDocuments.studentCard,
        name: 'Carte étudiant',
      });
    } else if (!userDocuments?.studentCard && session.studentCardUrl) {
      setDocumentEntry('studentCard', {
        uri: session.studentCardUrl,
        name: 'Carte étudiant',
      });
    }
  }, [session.studentCardUrl, setDocumentEntry, userDocuments?.studentCard]);

  useEffect(() => {
    if (userDocuments?.driverLicenseRecto) {
      setDocumentEntry('licenseRecto', {
        uri: userDocuments.driverLicenseRecto,
        name: 'Permis de conduire — Recto',
      });
    }
  }, [setDocumentEntry, userDocuments?.driverLicenseRecto]);

  useEffect(() => {
    if (userDocuments?.driverLicenseVerso) {
      setDocumentEntry('licenseVerso', {
        uri: userDocuments.driverLicenseVerso,
        name: 'Permis de conduire — Verso',
      });
    }
  }, [setDocumentEntry, userDocuments?.driverLicenseVerso]);

  const value = useMemo(() => ({ documents, setDocumentEntry }), [documents, setDocumentEntry]);

  return <DocumentStoreContext.Provider value={value}>{children}</DocumentStoreContext.Provider>;
}

export function useDocumentStore() {
  const context = useContext(DocumentStoreContext);
  if (!context) {
    throw new Error('useDocumentStore must be used within a DocumentStoreProvider');
  }
  return context;
}
