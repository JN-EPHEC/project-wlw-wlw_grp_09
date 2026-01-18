# Firestore 1:1 User Document Normalisation — Checklist

1. **Run the migration**  
   - Export a service account key, set `GOOGLE_APPLICATION_CREDENTIALS`, then execute `node scripts/migrate-user-docs.js`.  
   - Confirm the migration log reports each collection scanned and counts of documents migrated.

2. **Spot-check Firestore docs**  
   - In the console, verify `/businessQuotes/{uid}` exists for a user and contains `quoteId === uid`, `createdByUid`, `createdByEmail`, `clientTimestamp` and `status = "new"`.  
   - Confirm `/wallets/{uid}`, `/notificationPreferences/{uid}`, and `/notificationTokens/{uid}` documents now exist with `ownerUid === uid` and the expected fields (`balance`, `transactions`, `pushToken`, etc.).  
   - Ensure no remaining legacy documents with email/random IDs remain (the migration script deletes them).

3. **Validate Firestore rules**  
   - Re-deploy the updated `firestore.rules` file.  
   - Use the simulator or `firebase emulators:exec` to check that only `uid`-matched requests can read/write the collections above.

4. **Confirm client behaviour**  
   - Submit a business quote on the app and verify Firestore writes to `/businessQuotes/{auth.uid}` with merged data.  
   - Register a push token, toggle preferences, refresh the wallet snapshot (if applicable) and ensure the writes hit the `uid` documents instead of email-based IDs.

5. **Audit residual data paths**  
   - Run `scripts/check-user-id-consistency.js` to ensure the codebase still references the centralized `userDocRef`/`doc(db, ..., uid)` patterns.  
   - Inspect Cloud Functions or backend jobs for references to email-based doc IDs and migrate them if discovered.
