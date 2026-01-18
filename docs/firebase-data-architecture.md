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

La collection `trajets` contient deux usages compatibles :

1. Le **journal par utilisateur** existant (`trajets/{authUid}`) contient les blocs `publies`/`reservations` utilisés par les helpers `recordPublishedRide` / `recordReservedRide` de `src/firestoreTrips.ts`. Cette structure reste inchangée (lecture/écriture réservées au propriétaire du document).
2. Le **document centralisé par trajet** (`trajets/{trajetId}`) est le nouveau point d’entrée métier pour les workflows « publier », « demander », « accepter » et « historique ». L’application doit lire d’abord ce document et basculer en fallback vers le journal par utilisateur tant que les deux structures coexistent.

### 5.1. Document « trajet » (`trajets/{trajetId}`)

| Champ              | Type              | Description |
|--------------------|-------------------|-------------|
| `ownerUid`         | string            | UID conducteur, identique au champ de la règle Firestore. |
| `driverName`       | string            | Nom affiché (mis à jour à chaque publication). |
| `driverEmail`      | string            | E-mail normalisé du conducteur (serve de doublon de `ownerUid`). |
| `depart`           | string            | Label de départ saisi. |
| `destination`      | string            | Label de destination saisi. |
| `departureAt`      | `Timestamp`       | Timestamp Firestore (préférer `Timestamp` plutôt qu’un nombre). |
| `totalSeats`       | number            | Places vendues au départ. |
| `availableSeats`   | number            | Places restantes. |
| `price`            | number            | Prix par passager. |
| `campus`           | string (optionnel)| Campus sélectionné (si disponible). |
| `status`           | enum              | `published` / `cancelled` / `completed`. |
| `createdAt`        | `Timestamp`       | `serverTimestamp()` lors de la création. |
| `updatedAt`        | `Timestamp`       | Mise à jour à chaque mutation. |
| `search`           | objet indexable   | `{ departLower, destinationLower, dayKey }` pour faciliter les recherches. |

Le champ `search.dayKey` correspond à la date ISO (YYYY-MM-DD) de `departureAt`. Les appels front-end doivent faire un double-écriture temporaire vers la structure `publies`/`reservations` existante (pour le moment) en attendant que les anciens parcours migrent.

### 5.2. Sous-collections d’un trajet

- **`reservations`** (`trajets/{trajetId}/reservations/{reservationId}`)
  - Objectif : stocker les réservations confirmées du conducteur.
  - Champs obligatoires :
    | Champ | Type | Description |
    |---|---|---|
    | `rideId` | string (optionnel) | Identifiant des seeds existants (`seed-1`, `seed-2`). |
    | `passengerUid` | string | UID du passager confirmé. |
    | `passengerEmail` | string | E-mail normalisé. |
    | `seats` | number | Nombre de places réservées (généralement 1). |
    | `status` | enum | `pending` / `accepted` / `declined` / `cancelled` / `completed`. |
    | `reservedAt` / `updatedAt` | `Timestamp` | `serverTimestamp()` pour garder l’historique. |
    | `payoutProcessed` | bool (optionnel) | Flag existant, ne pas supprimer. |
    | `syncedAt` | `Timestamp` (optionnel) | Si la synchronisation batch existe déjà.

- **`requests`** (`trajets/{trajetId}/requests/{requestId}`)
  - Objectif : enregistrer les demandes « en attente » du passager.
  - Champs MVP :
    | Champ | Type | Description |
    |---|---|---|
    | `passengerUid` | string | UID du passager. |
    | `passengerEmail` | string | E-mail normalisé. |
    | `seatsRequested` | number | Compte des places demandées. |
    | `driverUid` | string (optionnel) | UID du conducteur pour les collectionGroup. |
    | `message` | string (optionnel) | Courte note, pas de messagerie. |
    | `status` | enum | `pending` / `accepted` / `declined` / `expired`. |
    | `createdAt` / `updatedAt` | `Timestamp` | `serverTimestamp()` pour audit.

- **`history`** (`trajets/{trajetId}/history/{eventId}`)
  - Objectif : journaliser les actions admin (création de demande, acceptation, réservation, annulation…).
  - Champs :
    | Champ | Type | Description |
    |---|---|---|
    | `type` | string | Exemple : `REQUEST_CREATED`, `REQUEST_ACCEPTED`, `RESERVATION_CREATED`, `CANCELLED`. |
    | `actorUid` | string | UID de la personne à l’origine de l’événement. |
    | `createdAt` | `Timestamp` | `serverTimestamp()`. |
    | `metadata` | objet | Informations contextuelles (rideId, seats…). |

### 5.3. Requêtes principales

1. **Mes trajets (driver)** : requête `firestore.collection('trajets').where('ownerUid', '==', currentUser.uid)` classée par `createdAt`. Index automatique sur `ownerUid`.
2. **Mes demandes (passager)** : requête `collectionGroup('requests').where('passengerUid', '==', currentUser.uid).orderBy('createdAt', 'desc')`. Index collectif nécessaire (`requests` collectionGroup + `passengerUid` + `createdAt`).
3. **Mes réservations (passager)** : `collectionGroup('reservations').where('passengerUid', '==', currentUser.uid)`.
4. **Admin overview** : combinaison `collectionGroup('requests')` ou `collectionGroup('reservations')` triées par `createdAt` pour surveiller demandes et confirmations.

**Index Firestore recommandés**
- `collectionGroup('requests')` : préfère un index composite `passengerUid (asc), createdAt (desc)` pour les vues passager + `driverUid (asc), createdAt (desc)` pour le dashboard conducteur.
*- `collectionGroup('reservations')` : index sur `passengerUid (asc)` (et `createdAt` si tu les classes par date).

### 5.4. Helpers TypeScript et compatibilité

- Le nouveau fichier `src/firestoreTrajets.ts` expose les types `TrajetDoc`, `TrajetRequestDoc`, `TrajetReservationDoc` ainsi que les helpers `createTrajet`, `createRequest`, `acceptRequest`, `declineRequest`, `createReservation`, `listMyTrips` et `listMyRequests`. Les helpers utilisent des transactions pour éviter les sur-réservations (`availableSeats`) et consignent les événements dans `history`.
- Les vues UI doivent toujours prioriser la lecture du document `trajets/{trajetId}` et rebasculer sur le journal par utilisateur (`trajets/{uid}`) uniquement si le document trip est absent. Cette double lecture garantit une compatibilité sans rupture (le nouveau modèle existe en parallèle).
- Les règles Firestore (section dédiée) autorisent désormais les opérations sur `trajets/{trajetId}`/subcollections tout en conservant `request.auth.uid == userId` pour le journal legacy.


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

## 11. Collection `businessQuotes` (Cloud Firestore)

- **Emplacement** : `firestore.collection('businessQuotes')`, alimenté par `src/firestoreBusinessQuotes.ts`.
- **Rôle** : stocker chaque demande de devis entreprise provenant du formulaire `/business-quote` afin que l’équipe admin récupère un historique des leads sans toucher à `users`, `wallets`, ou d’autres collections métier.
- **Clé fonctionnelle** : identifiant auto généré `quoteId`, toujours écrit dans le document (`quoteId` + `createdAt`).

| Champ                   | Type              | Description |
|------------------------|--------------------|-------------|
| `quoteId`              | string             | Identifiant auto généré du document. |
| `createdAt`           | `Timestamp`        | Marqueur `serverTimestamp()` pour ordonner les leads. |
| `updatedAt`           | `Timestamp`        | Mise à jour (`serverTimestamp()`) pour tracer les modifications ou re-soumissions. |
| `status`              | string             | `new` par défaut afin de filtrer les demandes non traitées. |
| `source`               | string             | Toujours `business-quote`. |
| `appVersion`           | string \| null     | Version de l’app (via `expo-constants`). |
| `platform`             | string \| null     | `ios`, `android` ou `web` provenant de `Platform.OS`. |
| `createdByUid`         | string \| null     | `auth.currentUser.uid` si l’utilisateur est connecté. |
| `createdByEmail`       | string             | Adresse e-mail Auth du submitteur (le champ `email` contient le contact pub). |
| `roleAtSubmit`         | string \| null     | `passenger` ou `driver` quand disponible, sinon `null`. |
| `originRoute`          | string             | Chemin frontend (`/business-quote`). |
| `clientTimestamp`      | number             | Horodatage `Date.now()` côté client pour tracer les sessions. |
| `companyName`          | string             | Nom de l’entreprise demandant un devis. |
| `contactName`          | string             | Responsable contact. |
| `email`                | string             | E-mail du contact (normalisé). |
| `phone`                | string \| null     | Téléphone (optionnel, format BE). |
| `website`              | string \| null     | Site web complet (`https://` ajouté automatiquement si absent). |
| `formatWanted`         | string             | Format souhaité sélectionné dans le formulaire (ex. `Banner horizontal`). |
| `budgetMonthly`        | string             | Option de budget sélectionnée par l’utilisateur. |
| `messageObjectives`    | string             | Description des objectifs / message publicitaire. |

**Alimentation**
- `app/business-quote.tsx` baptise `persistBusinessQuote` après validation stricte du formulaire (e-mail, téléphone BE léger, site web, champs obligatoires).
- `src/firestoreBusinessQuotes.ts` encapsule la création Firestore (`quoteId`, `createdAt`, `status = 'new'`, `source = 'business-quote'`).
- Les champs métier sont nettoyés (trim, e-mail en minuscules, `Platform.OS`, `Constants.expoConfig.version`).
- Le payload est enregistré une fois (`persistBusinessQuote`), puis le mailto reste optionnel : l’ouverture du client mail n’influence pas l’écriture Firestore.

- `allow create` : réservé aux utilisateurs authentifiés, la fonction vérifie que `createdByUid`/`createdByEmail` correspondent au compte en cours et que le payload respecte la whitelist (status `new`, source/origin fixes, champs correctement typés, plateforme en `ios|android|web`, etc.).
- `allow read/update/delete` : uniquement les admins identifiés (`request.auth.token.admin == true`).


L’équipement UX côté app (guard Auth + `router.replace('/sign-in')`) garantit que `createdByUid` n’est jamais `null` et que `createdByEmail` reflète le compte authentifié. `roleAtSubmit` est dérivé du mode actif (`passenger`/`driver`). Les règles Firestore interdisent tout champ supplémentaire et forcent `status = 'new'`, ce qui évite les abus (pas de lecture publique ni d’updates côté client).

## 12. Collection `auditLogs` (Cloud Firestore)

- **Emplacement** : `firestore.collection('auditLogs')`.
- **Rôle** : historiser chaque suppression de compte (Cloud Function `deleteAccountAndData`) et capturer les métriques de nettoyage Firestore|Storage|Auth.

| Champ             | Type               | Description |
|------------------|--------------------|-------------|
| `uid`             | string             | Identifiant Firebase Auth supprimé. |
| `email`           | string \| null     | Adresse associée (si disponible). |
| `action`          | string             | Toujours `"delete-account"`. |
| `deletedAt`       | `Timestamp`        | `serverTimestamp()` logguant la suppression. |
| `deletedCounts`   | map<string, number> | Nombre de documents/fichiers effacés par catégorie. |
| `status`          | string             | `"success"` ou `"error"` selon le résultat. |
| `errorMessage`    | string \| null     | Détail en cas d’échec. |

> La Cloud Function `deleteAccountAndData` écrit systématiquement une entrée ici. En plus de `deletedCounts`, l’entrée embarque `step`, `collection` et `errorMessage` quand l’opération échoue, ainsi que `status = 'error'`. Cela simplifie le débogage et le suivi des suppressions partielles.

**Écriture**
- Exclusivement via Cloud Functions (admin SDK) pour garantir l’intégrité des métriques.
