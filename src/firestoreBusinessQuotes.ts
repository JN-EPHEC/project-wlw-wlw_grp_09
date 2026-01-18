import { serverTimestamp, setDoc } from "firebase/firestore";

import { userDocRef, requireUid } from "./firestore/userDocumentHelpers";

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

const BUSINESS_QUOTES_COLLECTION = "businessQuotes";

export const persistBusinessQuote = async (payload: BusinessQuoteInput) => {
  const uid = requireUid(payload.createdByUid ?? undefined);
  const quoteRef = userDocRef(BUSINESS_QUOTES_COLLECTION, uid);
  await setDoc(
    quoteRef,
    {
      quoteId: quoteRef.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: "new",
      source: "business-quote",
      appVersion: payload.appVersion ?? null,
      platform: payload.platform ?? null,
      createdByUid: uid,
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
    },
    { merge: true }
  );
  return quoteRef.id;
};
