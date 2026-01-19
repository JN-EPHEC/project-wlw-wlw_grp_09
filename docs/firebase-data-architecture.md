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

- **Emplacement** : `firestore.collection('rides/{driverUid}/published')`, géré par `src/firestoreRides.ts`.
- **Rôle** : chaque conducteur publie un document `rides/{driverUid}/published/{rideId}` qui contient les métadonnées du trajet (`driverName`, `depart`, `destination`, `departureAt`, `availableSeats`, `price`, `passengers[]`, `status`, …). Un sous-dossier `requests` stocke les demandes (`pending` → `accepted` → `paid`) côté conducteur, et un miroir côté passager se trouve sous `/users/{passengerUid}/rideRequests/{requestId}` pour faciliter l’expérience « Mes demandes ».
- **Clé fonctionnelle** : `rideId` (même qu’en front). Les requêtes suivent le pattern `req-${Date.now()}-xxxx`.

| Champ                     | Type                     | Description / Source |
|---------------------------|--------------------------|----------------------|
| `rideId`                  | string                   | Identifiant partagé avec l’app. |
| `ownerUid`                | string                   | UID Firebase Auth du conducteur. |
| `ownerEmail`              | string (lowercase)       | E-mail du conducteur. |
| `driverName`              | string                   | Nom affiché dans l’interface passager. |
| `plate`                   | string                   | Plaque formatée. |
| `depart` / `destination`  | string                   | Origine / destination saisies. |
| `time` / `departureAt`    | string HH:MM / number ms | Heure saisie + timestamp normalisé. |
| `totalSeats` / `availableSeats`| number             | Capacités totales / places restantes. |
| `price` / `pricingMode`   | number / enum            | Tarif par passager + mode (single/double). |
| `passengers`              | string[]                 | E-mails normalisés des réservations validées. |
| `canceledPassengers`      | string[]                 | Historique des annulations. |
| `passengerCount`          | number                   | Utilisé pour les indicateurs / exports. |
| `status`                  | enum `active`/`completed`/`cancelled` | Suit le cycle de vie du trajet. |
| `createdAt` / `updatedAt` | Timestamp Firestore      | Gérés via `serverTimestamp` (`persistRideRecord`). |

**Sous-collections**
- `rides/{driverUid}/published/{rideId}/requests/{requestId}` contient :
  - `requestStatus`: `pending` / `accepted` / `paid` / `rejected` / `cancelled`
  - `paymentStatus`: `unpaid` / `processing` / `paid` / `failed` / `refunded`
  - `seatsRequested`, `passengerUid`, `passengerEmail`, `driverUid`, `rideId`
  - `paymentRef`, `paidAt`, `createdAt`, `updatedAt`
- `users/{passengerUid}/rideRequests/{requestId}` est le miroir UX :
  - copie des statuts (`requestStatus`, `paymentStatus`)
  - champ `ridePath` = `rides/{driverUid}/published/{rideId}`
  - `rideId`, `driverUid`, `passengerUid`, `createdAt`, `updatedAt`

**Flux**
- `app/services/rides.ts` (via `persistRideRecord`) alimente `rides/{ownerUid}/published/{rideId}` à chaque création/modification/réservation.
- `RideService` (`src/firestoreRides.ts`) expose `createRide`, `updateRide`, `deleteRide`, `createRideRequest`, `respondToRequest`, `markRequestPaid`.
- Les demandes sont synchronisées : `createRideRequest` écrit dans la sous-collection `requests` et dans le miroir `users/{passengerUid}/rideRequests`; un `respondToRequest` en transaction met à jour les deux documents et ajuste `availableSeats`/`passengerCount`.

**Règles**
- `firestore.rules` restreint l’accès à `rides/{driverUid}/published/{rideId}` au conducteur (`request.auth.uid == driverUid`) et donne la même restriction à la sous-collection `requests`.
- Les passagers lisent/écrivent uniquement dans leur miroir `users/{passengerUid}/rideRequests/{requestId}`.

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

### 5.2. Map `reservations` (`trajets/{driverUid}.reservations`)

Juste en dessous du champ `publies`, chaque document `trajets/{driverUid}` expose une map `reservations`. Chaque entrée (clé `reservationId`) rassemble les données minimales nécessaires pour que le conducteur puisse consulter les réservations sans créer de sous-collection.

La structure attendue :

```
reservations (map)
  • {reservationId} :
    • reservationId (string)
    • rideId (string)
    • driverUid (string)
    • passengerUid (string)
    • passengerEmail (string|null)
    • seatsRequested (number)
    • status (“pending”|“accepted”|“paid”|“cancelled”)
    • createdAt (serverTimestamp)
    • updatedAt (serverTimestamp)
    • rideSnapshot (object) :
      • depart (string)
      • destination (string)
      • departureAt (number|timestamp)
      • price (number)
```

Le helper `createReservation` de `src/trajetsReservationsService.ts` ajoute à la map le nouvel objet via `updateDoc(trajets/${driverUid}, FieldPath('reservations', reservationId), payload)` pour rester compatible avec la structure map existante. Le même helper met à jour `updatedAt` et l’entrée `users/{passengerUid}/reservations/{reservationId}` (voir section suivante) afin que le passager retrouve facilement son historique.

### 5.3. Index passager (`users/{passengerUid}/reservations`)

Pour permettre au passager de consulter ses réservations sans avoir à scanner tous les documents conducteur, on ajoute un index simple :

| Champ | Type | Description |
|---|---|---|
| `reservationId` | string | Identifiant coïncidant avec l’entrée du conducteur. |
| `driverUid` | string | UID du conducteur propriétaire du trajet. |
| `rideId` | string | Identifiant du ride/publikation ciblé. |
| `status` | enum | `pending` / `accepted` / `paid` / `cancelled`. |
| `createdAt` / `updatedAt` | `Timestamp` | `serverTimestamp()` pour refléter la dernière mise à jour. |

Le helper `listMyReservationsAsPassenger(passengerUid)` (même fichier) lit cette sous-collection ordonnée par `createdAt` pour alimenter l’interface « Mes trajets ». `driverUpdateReservationStatus` lève aussi le status dans cet index afin que le passager suive l’évolution.

-### 5.4. Sous-collections d’un trajet

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

### 5.5. Requêtes principales

1. **Mes trajets (driver)** : requête `firestore.collection('trajets').where('ownerUid', '==', currentUser.uid)` classée par `createdAt`. Index automatique sur `ownerUid`.
2. **Mes demandes (passager)** : requête `collectionGroup('requests').where('passengerUid', '==', currentUser.uid).orderBy('createdAt', 'desc')`. Index collectif nécessaire (`requests` collectionGroup + `passengerUid` + `createdAt`).
3. **Mes réservations (passager)** : lecture de `users/{currentUser.uid}/reservations` triée par `createdAt` (le helper `listMyReservationsAsPassenger` expose cette liste). On profite ainsi du cache local et des règles plus simples côté passager.
4. **Admin overview** : combinaison `collectionGroup('requests')` (dashboards conducteur + passager) et lecture des maps `trajets/{driverUid}.reservations` ou de l’index `users/{passengerUid}/reservations` pour auditer les réservations confirmées.

**Index Firestore recommandés**
- `collectionGroup('requests')` : préfère un index composite `passengerUid (asc), createdAt (desc)` pour les vues passager + `driverUid (asc), createdAt (desc)` pour le dashboard conducteur.
- `users/{uid}/reservations` : un index simple sur `createdAt (desc)` suffit pour commander l’historique par date.

### 5.6. Helpers TypeScript et compatibilité

- Le fichier `src/firestoreTrajets.ts` expose toujours `TrajetDoc`, `TrajetRequestDoc`, `TrajetReservationDoc` et les helpers historiques (`createTrajet`, `createRequest`, `acceptRequest`, `declineRequest`, `createReservation`, `listMyTrips`, `listMyRequests`). Ces helpers consignent les événements dans `history` et s’assurent que `availableSeats` reste cohérent.
- Le nouveau fichier `src/trajetsReservationsService.ts` orchestre la double écriture `trajets/{driverUid}.reservations` + `users/{passengerUid}/reservations` à l’aide de `FieldPath('reservations', reservationId)` et de `serverTimestamp()`. Il expose `createReservation`, `listMyReservationsAsPassenger` et `driverUpdateReservationStatus` pour faciliter les workflows passager/driver en respectant la structure map demandée.
- Les vues UI doivent toujours prioriser `trajets/{trajetId}` et tomber sur le journal `trajets/{uid}` ou `users/{uid}/reservations` seulement en fallback. Cette double lecture garantit une compatibilité sans rupture puisque l’ancien modèle (journal par utilisateur) reste accessible.
- Les règles Firestore (section dédiée) autorisent la mise à jour additionnelle des maps `publies`/`reservations` en contrôlant précisément ce que chaque rôle peut écrire.


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

## 10. Notifications (Firebase désactivé)

Les collections `notifications`, `notificationTokens` et `notificationPreferences` ont été retirées. Les écritions Firestore/Functions/Storage associées à la stack de notifications ne sont plus en service tant qu’un nouveau mécanisme n’aura pas été redéployé.

L’interface `app/notifications.tsx` affiche désormais un message fixe pour signaler la désactivation, et l’application ne tente plus d’écrire ou de lire ces documents ni de synchroniser des tokens push.

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
