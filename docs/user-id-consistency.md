# User ID consistency

Ce document liste les collections / sous-collections concernées par le modèle CampusRide et rappelle comment nous garantissons que **l’identifiant d’un membre (le `uid` Firebase Auth)** reste la même partout où il est utilisé. L’objectif : éviter des identifiants temporaires (`seed-*`, `ride-*`, etc.) lorsque les documents permettent de reconstituer un passage utilisateur.

## 1. `users/{uid}`

`users` est la source de vérité : le document est toujours écrit avec l’`uid` Firebase Auth (`savePassenger`, `saveDriver`). Les règles (`firestore.rules`) autorisent uniquement `request.auth.uid == userId` et chaque Cloud Function se base sur cette règle.  
**Action :** continuer à créer/mettre à jour le doc avec `auth.uid` (pas `email` ou `rideId`).

## 2. `wallets/{uid}` et collections associées

Les helpers (`src/firestoreWallets.ts`, `functions/index.js` à la ligne 360) utilisent `ownerUid` et/ ou `auth.uid` comme identifiant. Quand on crée un `wallet`, on utilise `uid` (le doc est `wallets/{uid}`) et on filtre par `ownerUid` dans les batches de suppression.
**Action :** rien à changer tant que les helpers `walletsByOwnerUid` gardent le `uid`.

## 3. `trajets/{trajetId}` (document carrières)

Le nouveau doc `trajets/{trajetId}` contient le champ `ownerUid` (et `driverEmail`). Il ne remplace pas encore `trajets/{uid}` (le journal par utilisateur) mais nous lisons les listes côté UI avec `ownerUid`.  
**Action :** continuer à écrire `ownerUid: session.uid`, `driverEmail: session.email` et porter ce `uid` dans l’historique (`history.actorUid`) et les sous-collections `requests`/`reservations`.

## 4. `trajets/{trajetId}/requests/{requestId}`

Les helpers `app/services/firestore-reservation-requests.ts` et `src/firestoreTrajets.ts:createRequest` écrivent `passengerUid`, `driverUid` et `rideId`. L’`id` du document peut être auto-généré mais la requête `collectionGroup('requests')` est toujours filtrée sur `passengerUid` ou `driverUid`.  
**Action :** continuer à écrire ces champs et prévoir les indexes sur `passengerUid`/`driverUid` + `createdAt` (cf. `docs/firebase-data-architecture.md`).

## 5. `trajets/{trajetId}/reservations/{reservationId}`

Les résa se synchronisent via `createReservation` qui reçoit `passengerUid` et `rideId`. Lors de l’acceptation on décrémente `availableSeats` avec le `ownerUid` du trajet lu dans la transaction.

## 6. `trajets/{trajetId}/history/{eventId}`

Chaque événement (création de demande, acceptation, annulation) inclut `actorUid`. On conserve le `uid` qui a déclenché l’action (driver ou passager).

## 7. Autres collections (businessQuotes…)

- `businessQuotes` contient `createdByUid` et se supprime par `uid`.

## Checklist d’audit

1. `users` et `wallets` restent indexés par le `uid` (pas d’autre identifiant).
2. Les collections de notifications (`notifications`, `notificationTokens`, `notificationPreferences`) sont désactivées ; le code ne doit plus écrire/consulter ces documents.
3. `trajets/{trajetId}` doit toujours stocker `driverEmail` + `ownerUid` (= `session.uid`).
4. `requests` et `reservations` incluent `passengerUid`/`driverUid` et la collectionGroup utilise ces champs dans les queries.
5. Les helpers Firestore (`createRequest`, `acceptRequest`, `removeReservationRequest`) acceptent un `uid` explicite pour éviter de deviner le driver/passager.
6. Les règles Firestore vont continuer à autoriser `auth.uid == trajetId` pour le journal utilisateur legacy (le doc `trajets/{uid}`) tout en protégeant `ownerUid` sur le doc central.

## Vérification automatique

- `npm run check:user-id-consistency` parcourt les fichiers TypeScript/JavaScript et s’assure qu’au moins une écriture sur chaque collection critique (`users`, `wallets`, `trajets`) utilise `auth.uid` / `ownerUid` comme identifiant.
- `npm run verify:firebase-requests -- --tripId=<trajetId> [--passengerUid=<uid>]` se connecte à Firestore (via `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) et vérifie :
  1. Que le doc `trajets/{trajetId}` existe avec `ownerUid`, `driverName`, `driverEmail`, `depart`, `destination`, `departureAt` (Timestamp), `totalSeats`, `availableSeats`, `price`, `status`, `search`, `createdAt`, `updatedAt`.
  2. Que les entrées `trajets/{trajetId}/requests` sont présentes, ont des statuts `pending`/`accepted` et stockent `passengerUid`/`driverUid`.
  3. Que la sous-collection `history` contient des événements `REQUEST_CREATED` / `REQUEST_ACCEPTED` pour tracer le comportement.

Avant de lancer la commande tu dois configurer les variables d’environnement du compte de service Firebase :
```bash
export FIREBASE_PROJECT_ID=...
export FIREBASE_CLIENT_EMAIL=...
export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```
Tu peux ensuite exécuter `npm run verify:firebase-requests -- --tripId=ride-123 --passengerUid=xyz`.

Si tu veux, je peux automatiser d’autres contrôles (tests, scripts complémentaires). Tu veux que j’ajoute une check-list automatique ou une PR qui valide chaque collection ?
