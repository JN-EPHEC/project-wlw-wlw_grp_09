const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.createReceiptOnDriverCreate = functions.firestore
  .document("users/{userId}")
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const userId = context.params.userId;

    if (data.role !== "driver") {
      return null;
    }

    return db.collection("receipts").add({
      userId,
      fullName: data.firstName + " " + data.lastName,
      email: data.email,
      phone: data.phone,
      carPlate: data.carPlate,
      carModel: data.carModel,
      type: "driver_registration",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
