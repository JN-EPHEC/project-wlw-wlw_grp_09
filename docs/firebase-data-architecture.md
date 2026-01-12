# Architecture Firebase – CampusRide

Ce document sert de référence unique pour savoir **où** et **comment** nous stockons les données applicatives dans Firebase. L’idée est d’ajouter un sous-chapitre par ressource (collection, bucket, fonction, etc.) pour garder une vue d’ensemble cohérente. À ce stade, les entités `users`, `rides` et `wallets` (Firestore) ainsi que `authUsers` (Firebase Auth) sont alimentées par l’application (cf. `src/firestoreUsers.js`, `src/firestoreRides.ts`, `src/firestoreWallets.ts` et `app/services/auth.ts`).

## 1. Vue d’ensemble

| Domaine          | Service Firebase | Objectif                                                                                     |
|------------------|------------------|----------------------------------------------------------------------------------------------|
| Authentification | **Firebase Auth**| Gestion des comptes e-mail/mot de passe, vérification et sessions sécurisées.                |
| Profils          | **Firestore**    | Collection `users` contenant toutes les métadonnées métier (passager, conducteur, documents).|
| Fichiers         | **Storage**      | Bucket `gs://…/users/*` pour stocker cartes étudiantes, selfies et documents conducteurs.    |

Des Cloud Functions (dossier `functions/`) viendront plus tard orchestrer les workflows (webhooks, validations, notifications). Quand un nouveau domaine métier devient persistant (trajets, réservations, paiements, etc.), ajouter un chapitre « Collection … » sur ce modèle.

## 2. Collection `users` (Cloud Firestore)

- **Emplacement** : `firestore.collection('users')`, encapsulé par `src/firestoreUsers.js`.
- **Rôle** : stocker la fiche complète d’un membre (passager/driver) pour toutes les fonctionnalités UI (vérification, profil, documents, rôles).
- **Clé fonctionnelle** : identifiant Firebase Auth (`auth.uid`). L’e-mail normalisé reste unique, mais l’ID du document est exactement le même UID que celui utilisé pour le dossier Storage (`users/{uid}/…`), ce qui permet de recouper facilement les ressources.

| Champ                   | Type                | Obligatoire | Description / Source |
|-------------------------|---------------------|-------------|----------------------|
| `firstName`             | string              | oui         | Prénom issu du formulaire (`savePassenger`, `saveDriver`). |
| `lastName`              | string              | oui         | Nom de famille. |
| `email`                 | string (lowercase)  | oui         | Identifiant unique, même valeur que dans Firebase Auth. |
| `authUid`               | string              | oui         | Copie du `uid` Firebase Auth, identique à l’ID du document/chemin Storage. |
| `phone`                 | string              | oui         | Numéro de contact vérifié. |
| `campus`                | string              | optionnel   | Campus EPHEC sélectionné par le passager (`updatePassengerProfile`). |
| `role`                  | enum `passenger`/`driver` | oui | `passenger` par défaut, bascule sur `driver` dès que les documents sont fournis. |
| `isPassenger` / `isDriver` | boolean | oui | Flags utilisés côté app pour activer les expériences. |
| `studentCardUrl`, `selfieUrl`, `driverSelfieUrl` | string (URL Storage) | optionnel | Uploads stockés dans le bucket `users/{uid}`. |
| `driverLicenseFrontUrl`, `driverLicenseBackUrl`, `vehiclePhotoUrl` | string | optionnel | Documents conducteurs (`saveDriverDocuments`). |
| `driverVehiclePlate`    | string              | optionnel   | Plaque formatée (capitalize + tirets), alimentée par `saveDriverDocuments`. |
| `driverLicenseExpiryLabel` | string (MM/AA)  | optionnel   | Affiché côté app ; sa variante ISO (`driverLicenseExpiryISO`) facilite les contrôles backend. |
| `verificationCode`      | string              | optionnel   | Code temporaire envoyé à l’e-mail (voir `setPassengerVerificationCode`). |
| `verificationExpiresAt` | number (timestamp ms) | optionnel | Expiration du code (10 min). |
| `verified`              | boolean             | défaut `false` | Passe à `true` via `markPassengerVerified`. |
| `createdAt` / `updatedAt` | `Timestamp` Firestore | auto | Champ d’audit (`serverTimestamp()`). |

**Flux principaux**
1. **Inscription passager** : `savePassenger` crée (ou fusionne) le doc `users/{uid}` + uploads éventuels. Lors d’une migration depuis l’ancien schéma (ID = e-mail), la fonction recopie les données dans le `uid` correspondant et supprime l’ancien document.
2. **Mise à jour** : `updatePassengerProfile` conserve un doc unique, met `updatedAt`.
3. **Vérification** : `setPassengerVerificationCode` écrit `verificationCode`, `verificationExpiresAt`; `markPassengerVerified` les purge et bascule `verified`.
4. **Activation conducteur** : `saveDriver` et `saveDriverDocuments` complètent la plaque, l’expiration du permis + URL des documents, tout en conservant `isPassenger = true`.

**Index / règles**
- Index composite à prévoir (`email` + `role`) pour filtrer rapidement les conducteurs/passagers.
- `firestore.rules` (déployé) applique strictement : création uniquement si l’e-mail du document correspond à `request.auth.token.email` et que `role ∈ {passenger, driver}` ; lecture/mise à jour/suppression réservées au propriétaire. Toute autre collection est refusée par défaut.

## 3. Collection `rides` (Cloud Firestore)

- **Emplacement** : `firestore.collection('rides')`, géré par `src/firestoreRides.ts`.
- **Rôle** : journaliser chaque trajet publié (même en mode démo) avec les informations clés pour l’équipe CampusRide (conducteur, trajet, places, statut, paiements).
- **Clé fonctionnelle** : `rideId` (même identifiant que côté front `app/services/rides.ts`).

| Champ                     | Type                     | Description / Source |
|---------------------------|--------------------------|----------------------|
| `rideId`                  | string                   | Identifiant partagé avec l’app. |
| `ownerEmail`              | string (lowercase)       | Conducteur authentifié ayant publié le trajet. |
| `driver`                  | string                   | Nom affiché côté passagers. |
| `vehiclePlate`            | string                   | Plaque formatée. |
| `depart` / `destination`  | string                   | Origine / destination saisis. |
| `time` / `departureAt`    | string HH:MM / timestamp | Heure saisie + timestamp calculé pour les rappels. |
| `seats` / `availableSeats`| number                   | Places totales / restantes. |
| `price` / `pricingMode`   | number / enum            | Prix par passager + mode (single/double). |
| `passengers`              | string[]                 | E-mails normalisés des passagers confirmés. |
| `canceledPassengers`      | string[]                 | Historique des passagers annulés. |
| `passengerCount`          | number                   | Calculé pour faciliter les filtres / exports. |
| `payoutProcessed`         | boolean                  | Aligné avec `processRidePayouts`. |
| `status`                  | enum `scheduled`/`ongoing`/`completed`/`cancelled` | Déduit automatiquement, `cancelled` si `removeRide`. |
| `cancellationReason`      | string \| null           | Motif métier (`driver_cancelled`, etc.). |
| `createdAt` / `updatedAt` | number ms                | Horodatages front (utilisés aussi pour détecter les mises à jour). |
| `firestoreUpdatedAt`      | Timestamp Firestore      | Audit serveur (écrit via `serverTimestamp`). |

**Alimentation**
- `app/services/rides.ts` appelle `persistRideRecord` lors de la création, modification, réservation, annulation, payout.
- Les règles Firestore autorisent la lecture à tout membre connecté et les écritures uniquement au propriétaire du trajet (ou à la requête dont `ownerEmail` correspond au compte courant). Les passagers s’appuieront plus tard sur des Cloud Functions.

## 4. Collection `wallets` (Cloud Firestore)

- **Emplacement** : `firestore.collection('wallets')`, géré par `src/firestoreWallets.ts`.
- **Rôle** : stocker un snapshot temps-réel du portefeuille CampusRide d’un membre (solde, carte, transactions).
- **Clé fonctionnelle** : identique à `users` → `wallets/{authUid}`. Un cache côté client résout dynamiquement l’UID à partir de l’e-mail pour conserver la compatibilité avec les API existantes.

| Champ          | Type    | Description / Source |
|----------------|---------|----------------------|
| `email`        | string  | E-mail normalisé du propriétaire (facilite les requêtes). |
| `ownerUid`     | string  | `uid` Firebase Auth qui sert aussi d’ID de document. |
| `balance`      | number  | Solde EUR courant exposé dans l’app. |
| `payoutMethod` | object \| null | Carte active (marque, `last4`, mois/année d’expiration, titulaire). |
| `transactions` | array   | Historique des 50 derniers mouvements (type, montant, description, `balanceAfter`). |
| `updatedAt`    | Timestamp Firestore | Audit serveur automatiquement mis à jour. |

**Alimentation**
- Toutes les mutations du portefeuille passent par `app/services/wallet.ts`. La fonction `notify(email)` déclenche `persistWalletSnapshot` qui résout l’UID propriétaire et enregistre uniquement les données essentielles.
- Les règles Firestore restreignent lecture/écriture au propriétaire (`request.auth.token.email`).

## 5. Collection `trajets` (Cloud Firestore)

- **Emplacement** : `firestore.collection('trajets')`, alimenté via `src/firestoreTrips.ts`.
- **Rôle** : journaliser, pour chaque membre (`trajets/{authUid}`), la liste des trajets qu’il a publiés ou réservés.
- **Structure** : un document par utilisateur `{ publies: { [rideId]: {...} }, reservations: { [rideId]: {...} } }`.

| Champ (par entrée)   | Type      | Description |
|----------------------|-----------|-------------|
| `rideId`             | string    | Identifiant du trajet (référence `rides`). |
| `type` / `role`      | enum      | `published`/`driver` ou `reserved`/`passenger`. |
| `driver` / `driverEmail` | string | Nom + e-mail conducteur. |
| `depart` / `destination` | string | Labels du trajet. |
| `time` / `departureAt`   | string / number | Heure saisie + timestamp. |
| `price`              | number    | Prix par passager. |
| `seats` / `availableSeats` | number | Places totales / restantes (publies). |
| `passengers`         | string[]  | Liste des passagers confirmés (publies). |
| `reservedAt`         | number    | Timestamp ms de la réservation (reservations). |
| `status`             | enum      | `upcoming` ou `departed` selon `departureAt`. |
| `syncedAt`           | Timestamp Firestore | Audit serveur automatiquement mis à jour. |

**Alimentation**
- `app/services/rides.ts` appelle `recordPublishedRide` lors de `addRide` et `recordReservedRide` après `reserveSeat`. Chaque helper résout l’UID via `users` (cache) puis merge l’entrée dans `trajets/{uid}`.
- Les règles Firestore autorisent lecture/écriture uniquement pour l’utilisateur concerné (`request.auth.uid == userId`).

## 6. `authUsers` (Firebase Auth)

Même si « authUsers » n’est pas une collection Firestore, ce sous-chapitre sert de check-list pour l’état des comptes côté Firebase Auth :

- **Emplacement** : Console Firebase > Authentication.
- **Source** : `app/services/auth.ts` (`createUserWithEmailAndPassword`, `signInWithEmailAndPassword`).
- **Champs natifs utilisés**
  - `uid` : clé primaire pour relier les Cloud Functions.
  - `email` / `emailVerified` : doit rester aligné avec `users.email` et refléter l’état de vérification mail.
  - `displayName` : mis à jour via `updateProfile` après inscription (`sanitizeName`).
  - `photoURL` : future synchronisation avec `avatarUrl`.
- **Custom claims à prévoir** (pas encore implémentés) : `isDriver`, `isPassenger`, `isAdmin`. Ils faciliteront les règles Firestore/Storage.

**Workflow actuel**
1. Création compte → Firebase Auth crée `authUser`.
2. `onAuthStateChanged` (dans `app/services/auth.ts`) hydrate `AuthSession` avec `users` + champ `emailVerified`.
3. Déconnexion (`firebaseSignOut`) purge la session locale mais pas les documents Firestore.

**To-do autour des authUsers**
- Ajouter un Cloud Function `onCreate` pour initialiser un doc `users` minimal si besoin.
- Mettre en place une stratégie de suppression (GDPR) : supprimer doc `users` + fichiers Storage quand un `authUser` est supprimé.

## 7. Firebase Storage – dossiers `users/*`

- **Chemins** gérés par `src/storageUploads.js` :
  - `users/{uid}/documents/student-card-*.jpg`
  - `users/{uid}/selfies/identity-selfie-*.jpg`
  - `users/{uid}/driver-licenses/license-front|back-*.jpg`
  - `users/{uid}/driver-licenses/vehicle-photo-*.jpg`
- `storageUploads.uploadUserDocument` résout automatiquement l’UID de l’utilisateur connecté (`auth.currentUser.uid`) pour garantir l’isolation côté Storage.
- **Règles effectives** (`storage.rules`) :
  - `allow read, write: if request.auth.uid == userId` sur tous les sous-dossiers `users/{userId}/**`.
  - `deny` par défaut sur le reste du bucket.

Chaque URL est stockée dans le document `users` correspondant pour éviter de re-parcourir Storage.

## 8. Ajouter de nouvelles entités

Pour chaque future donnée persistée (trajets, réservations, transactions, rapports…), créer un sous-chapitre suivant ce template :

1. **Nom & service** (`collection('rides')`, `storage/rides`, etc.).
2. **Rôle métier** + relation avec `users`.
3. **Schéma tabulaire** (champs, types, validations).
4. **APIs** ou services concernés dans le code.
5. **Contraintes** (index, TTL, RGPD, quotas).

Cela garantit que la stack Firebase reste lisible même si plusieurs personnes interviennent.

## 9. Cloud Functions (Notifications & e-mails)

- `functions/index.js` héberge les déclencheurs backend.
- **`createReceiptOnDriverCreate`** : déclenché à la création d’un document `users` rôle `driver`. Crée une entrée `receipts` pour suivre les demandes de vérification conducteur.
- **`notifyVerificationCode`** : déclenché à chaque update de `users/{userId}`. Dès que `verificationCode` change, la fonction envoie un e-mail via l’API Resend au propriétaire du compte avec le code et l’expiration.

Configuration nécessaire pour l’envoi d’e-mails :

```bash
# Définir les secrets côté Firebase Functions (ou variables d'environnement)
firebase functions:config:set resend.api_key="sk_live_xxx" resend.from="CampusRide <no-reply@campusride.app>" app.base_url="https://campusride.app"

# Puis déployer
cd functions
npm install
firebase deploy --only functions
```

En développement, si `RESEND_API_KEY` est absent, la fonction se contente de journaliser l’absence de configuration afin de ne pas casser les tests.

## 10. Notifications (Firestore)

Les notifications temps-réel reposent désormais sur trois collections Firestore afin de conserver une trace serveur même lorsque l’app est relancée ou installée sur un autre appareil.

| Ressource                     | Service         | Description                                                                                              |
|-------------------------------|-----------------|----------------------------------------------------------------------------------------------------------|
| `notificationTokens/{email}`  | Firestore       | Token Expo/FCM courant + plateforme pour envoyer un push.                                                |
| `notificationPreferences/{email}` | Firestore   | Préférences utilisateur (`pushEnabled`, sons, rappels, `lastRegisteredAt`, token courant…).               |
| `notifications/{autoId}`      | Firestore       | Journal des événements envoyés (messages, réservations, rappels) avec métadonnées et planification.      |

**Alimentation côté app** (`app/services/notifications.ts`) :

- `registerPushToken` → `persistPushTokenRecord` écrit/merge le token normalisé et `platform` (ios/android/web) + `updatedAt`.
- `updateNotificationPreferences` → `persistNotificationPreferencesRecord` synchronise les toggles (push, rappels, sons) et `lastRegisteredAt`.
- `pushNotification` → `persistNotificationEventRecord` ajoute une entrée immuable pour chaque notification envoyée (titre, corps, `metadata`, `scheduleAt`, `scheduleKey`).

Cela couvre la Definition of Done : le « serveur de notifications » repose sur Firestore, et les tokens push sont enregistrés/mis à jour dès qu’ils changent. Des Cloud Functions pourront ensuite se brancher sur ces collections (`notifications` pour envoyer, `notificationTokens` pour cibler les appareils) sans modifier le front.
