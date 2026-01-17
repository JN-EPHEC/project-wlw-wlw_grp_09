import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db } from "./firebase";

export type BusinessQuoteRole = "passenger" | "driver";

export type BusinessQuoteInput = {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string | null;
  website?: string | null;
  formatWanted: string;
  budgetMonthly: string;
  messageObjectives: string;
  appVersion: string | null;
  platform: string | null;
  createdByUid: string | null;
  createdByEmail: string | null;
  roleAtSubmit?: BusinessQuoteRole | null;
  originRoute: string;
  clientTimestamp: number;
};

const businessQuotesCol = collection(db, "businessQuotes");

export const persistBusinessQuote = async (payload: BusinessQuoteInput) => {
  const quoteRef = doc(businessQuotesCol);
  await setDoc(quoteRef, {
    quoteId: quoteRef.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    status: "new",
    source: "business-quote",
    appVersion: payload.appVersion ?? null,
    platform: payload.platform ?? null,
    createdByUid: payload.createdByUid ?? null,
    createdByEmail: payload.createdByEmail ?? null,
    roleAtSubmit: payload.roleAtSubmit ?? null,
    companyName: payload.companyName,
    contactName: payload.contactName,
    email: payload.email,
    phone: payload.phone ?? null,
    website: payload.website ?? null,
    formatWanted: payload.formatWanted,
    budgetMonthly: payload.budgetMonthly,
    messageObjectives: payload.messageObjectives,
    originRoute: payload.originRoute,
    clientTimestamp: payload.clientTimestamp,
  });
  return quoteRef.id;
};
