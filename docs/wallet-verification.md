# Vérification wallet & migration

## Commandes
- `npm run migrate:wallets` — convertit tous les wallets existants en `balanceCents` et écrit l’historique dans les sous-collections `/wallets/{uid}/transactions`.
- `npx --yes firebase-tools deploy --only firestore:rules --project campusride-8b619` — redéploie les règles qui rendent `/wallets/{uid}` et `transactions/{txId}` en lecture-only pour les clients.

## Checklist de validation manuelle

1. **Vérifier la migration**
   - Ouvrir la console Firebase, naviguer vers `wallets/{uid}` pour un utilisateur connu (ex. `TzL7BD9ygTcSFh2zHdjJjwTf4pb2`).
   - Confirmer que `balanceCents` est présent et qu’il contient un entier (pas de float).
   - S’assurer que la sous-collection `/transactions` existe et contient au moins un document avec :
     - `amountCents`, `balanceBeforeCents`, `balanceAfterCents`
     - `idempotencyKey`, `createdByUid` et `status == "completed"`.
   - Vérifier que `wallet.balanceCents === dernierTransaction.balanceAfterCents`.

2. **Tester les flows d’écriture**
   - Recharge l’app Expo/Web, fais un top-up ou déclenche un paiement ride/wallet.
   - Dans la console, ouvrir `functions.log` si besoin pour observer `adjustBalance` ou `transferForRide`.
   - Le doc `/wallets/{uid}` doit se mettre à jour dans la console (même `balanceCents`).
   - La nouvelle transaction doit apparaître dans `/wallets/{uid}/transactions` avec les bons champs (débit/crédit, `rideId`, `counterpartyUid` le cas échéant).

3. **Tester la règle de lecture (échecs attendus)**
   - Depuis un autre compte, essayer de lire le `wallet` d’un utilisateur différent via une requête Firestore (devtools, script JS). La requête doit échouer (permission denied).
   - S’assurer que la création/écriture direct côté client sur `/wallets/{uid}` est bloquée.

4. **Tester l’idempotence**
   - Appeler `functions.adjustBalance` avec un `idempotencyKey` déjà utilisé : la fonction doit retourner l’état actuel sans dupliquer la transaction.
   - Idem pour `transferForRide`: en cas de double clic sur “Payer avec wallet”, le `fee` et le débit ne doivent pas se cumuler deux fois.
   - Vérifier que `wallet.balanceCents` correspond toujours au plus récent `transaction.balanceAfterCents`.

5. **Succès final**
   - Toutes les vérifications ci-dessus sont satisfaites -> déployer le code (functions + règles) si ce n’est pas déjà fait et référencer cette checklist dans ton CR/PR.

## Conseils

- Conserver un `idempotencyKey` généré côté client (UUID) pour les paiements ride/top-up.  
- Toujours relancer `npm run migrate:wallets` après un restore de base ou dans un environnement de staging qui n’a pas encore les `balanceCents`.  
- Utiliser la console Firebase pour surveiller les sous-collections `transactions` et vérifier que chaque `balanceAfterCents` est cohérent avec l’état du doc parent.

