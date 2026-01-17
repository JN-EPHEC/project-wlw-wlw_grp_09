import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db } from "./firebase";

export type BusinessQuoteInput = {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  website: string | null;
  desiredFormat: string;
  estimatedMonthlyBudget: string;
  messageObjectives: string;
  appVersion: string | null;
  platform: string | null;
  userId: string | null;
  userEmail: string | null;
  role: string | null;
  consent?: boolean;
  note?: string | null;
  originRoute: string;
  clientTimestamp: number;
};

const businessQuotesCol = collection(db, "businessQuotes");

export const persistBusinessQuote = async (payload: BusinessQuoteInput) => {
  const quoteRef = doc(businessQuotesCol);
  await setDoc(quoteRef, {
    quoteId: quoteRef.id,
    createdAt: serverTimestamp(),
    status: "new",
    source: "business-quote",
    appVersion: payload.appVersion ?? null,
    platform: payload.platform ?? null,
    userId: payload.userId ?? null,
    userEmail: payload.userEmail ?? null,
    role: payload.role ?? null,
    companyName: payload.companyName,
    contactName: payload.contactName,
    contactEmail: payload.contactEmail,
    contactPhone: payload.contactPhone ?? null,
    website: payload.website ?? null,
    desiredFormat: payload.desiredFormat,
    estimatedMonthlyBudget: payload.estimatedMonthlyBudget,
    messageObjectives: payload.messageObjectives,
    consent: payload.consent ?? true,
    note: payload.note ?? null,
    originRoute: payload.originRoute,
    clientTimestamp: payload.clientTimestamp,
  });
  return quoteRef.id;
};
