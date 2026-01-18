#!/usr/bin/env node
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const UID = process.argv[2];
if (!UID) {
  console.error("Usage: node scripts/check-wallet.js <uid>");
  process.exit(1);
}

const formatAmount = (value) => `${(value / 100).toFixed(2)} €`;

const run = async () => {
  const walletRef = db.collection("wallets").doc(UID);
  const walletSnap = await walletRef.get();
  if (!walletSnap.exists) {
    throw new Error(`wallet ${UID} not found`);
  }
  const wallet = walletSnap.data();
  console.log("wallet.balanceCents:", wallet.balanceCents);

  const txQuery = walletRef
    .collection("transactions")
    .orderBy("createdAt", "desc")
    .limit(1);
  const txSnap = await txQuery.get();
  if (txSnap.empty) {
    console.log("no transactions found");
    return;
  }
  const tx = txSnap.docs[0].data();
  console.log("last transaction:");
  console.log("  id:", txSnap.docs[0].id);
  console.log("  direction:", tx.direction);
  console.log("  amountCents:", tx.amountCents);
  console.log("  balanceAfterCents:", tx.balanceAfterCents);
  console.log("  balanceBeforeCents:", tx.balanceBeforeCents);
  console.log(
    "  matches wallet:",
    wallet.balanceCents === tx.balanceAfterCents ? "yes" : "no"
  );
  console.log("  description:", tx.description ?? "<none>");
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
