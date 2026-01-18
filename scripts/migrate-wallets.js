#!/usr/bin/env node
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const toCents = (value) => Math.round((Number(value) || 0) * 100);

const convertTransaction = (tx, balanceAfterCents, index) => {
  const amountCents = toCents(tx.amount ?? 0);
  const direction = tx.type === "debit" ? "debit" : "credit";
  const balanceBeforeCents =
    direction === "credit"
      ? balanceAfterCents - amountCents
      : balanceAfterCents + amountCents;
  return {
    amountCents,
    balanceBeforeCents,
    balanceAfterCents,
    type: "ledger",
    direction,
    status: "completed",
    source: tx.description ?? "historic",
    description: tx.description ?? null,
    metadata: tx.metadata ?? null,
    createdAt: tx.createdAt
      ? admin.firestore.Timestamp.fromMillis(Number(tx.createdAt))
      : FieldValue.serverTimestamp(),
    idempotencyKey: tx.id ?? `legacy-${index}-${Date.now()}`,
  };
};

const migrateWallet = async (doc) => {
  const wallet = doc.data() || {};
  const uid = doc.id;
  const walletRef = db.collection("wallets").doc(uid);
  const balanceCents =
    typeof wallet.balanceCents === "number"
      ? wallet.balanceCents
      : toCents(wallet.balance);
  const now = admin.firestore.Timestamp.now();
  const merged = {
    balanceCents,
    ownerUid: wallet.ownerUid ?? uid,
    currency: wallet.currency ?? "EUR",
    payoutMethod: wallet.payoutMethod ?? null,
    createdAt: wallet.createdAt ?? now,
    updatedAt: now,
  };

  const txBatch = db.batch();
  txBatch.set(walletRef, merged, { merge: true });
  if (Array.isArray(wallet.transactions) && wallet.transactions.length > 0) {
    wallet.transactions.forEach((tx, index) => {
      const balanceAfterCents = toCents(tx.balanceAfter ?? balanceCents);
      const record = convertTransaction(tx, balanceAfterCents, index);
      record.createdByUid = wallet.ownerUid ?? uid;
      record.rideId = tx.metadata?.rideId ?? null;
      record.counterpartyUid = tx.metadata?.counterpartyUid ?? null;
      record.status = "completed";
      const txRef = walletRef
        .collection("transactions")
        .doc(record.idempotencyKey);
      txBatch.set(txRef, record, { merge: true });
    });
    txBatch.update(walletRef, { transactions: FieldValue.delete() });
  }
  await txBatch.commit();
};

const runMigration = async () => {
  const snapshot = await db.collection("wallets").get();
  for (const doc of snapshot.docs) {
    await migrateWallet(doc);
    console.log(`[migration] wallet ${doc.id} normalised`);
  }
  console.log("[migration] complete");
};

runMigration().catch((error) => {
  console.error("[migration] failed", error);
  process.exit(1);
});
