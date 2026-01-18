# Wallet ledger normalisation checklist

1. **Migration**
   - Exécute `GOOGLE_APPLICATION_CREDENTIALS=/chemin/key.json npm run migrate:wallets`.
   - Vérifie que chaque doc `wallets/{uid}` contient : `balanceCents` (int), `currency`, `ownerUid`, `createdAt`, `updatedAt`, `payoutMethod`. Le champ `transactions` (array) doit avoir disparu.
   - Vérifie que `wallets/{uid}/transactions` contient désormais toutes les lignes historiques avec `amountCents`, `balanceBeforeCents`, `balanceAfterCents`, `direction`, `status`, `idempotencyKey`, `source`, `rideId`, `createdByUid`.

2. **Cloud Functions**
   - `wallet.adjustBalance` callable : vérifie `request.auth.uid`, idempotencyKey, calcule `balanceCents`, écrit `/wallets/{uid}` + `/wallets/{uid}/transactions/{txId}` dans la même transaction. Rejette les montants <= 0 et les soldes négatifs.
   - `wallet.transferForRide` callable : exécute une seule transaction multi-documents pour débiter le passager et créditer le conducteur (rideId + feeCents) tout en vérifiant l’idempotencyKey côté passager.

3. **Frontend**
   - Tous les services (`wallet.ts`, `payments.ts`, `rides.ts`, `notifications.ts`) doivent appeler `wallet.adjustBalance` / `wallet.transferForRide` via un `httpsCallable` (`firebase/functions`) plutôt que d’écrire Firestore.
   - La vue `wallet` ne lit plus le champ `transactions` du doc ; elle surveille le sous-collection `wallets/{uid}/transactions`.

4. **Sécurité**
   - Publie `firestore.rules` contenant :
     ```firestore
     match /wallets/{uid} {
       allow read: if request.auth.uid == uid;
       allow write: if false;
       match /transactions/{txId} {
         allow read: if request.auth.uid == uid;
         allow write: if false;
       }
     }
     ```
   - Les fonctions admin remplacent toutes les écritures client.

5. **Vérification manuelle**
   - Top-up / retrait : soumets via l’UI; confirme que `wallet.balanceCents` et `transactions` ont été mis à jour avec `amountCents` et `balanceAfterCents`.
   - Paiement course : valide que le passager perd `amountCents + feeCents`, le conducteur gagne `amountCents - feeCents`, et que les deux transactions portent le même `rideId`/`idempotencyKey`.
   - Double clic / retry offline : ré-envoie la même `idempotencyKey` et vérifie qu’aucune nouvelle transaction n’est créée et que le solde reste stable.
   - Contrôle de cohérence : `wallet.balanceCents === lastTransaction.balanceAfterCents`.

6. **Opérations Firebase Console**
   - Inspectez `wallets/{uid}` et sa sous-collection `transactions` pour voir les nouveaux champs `balanceBeforeCents`, `direction`, `status`.
   - Les anciens documents auto-ID doivent avoir disparu (ou porter un champ `migratedFrom`).
   - Les règles publiées doivent apparaître dans l’onglet de simulation : testez `get`/`write` en simulant `request.auth.uid`.
