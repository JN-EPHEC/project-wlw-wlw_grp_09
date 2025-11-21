# Messagerie CampusRide – Architecture & TODO

Cette version de l’application intègre une maquette fonctionnelle de messagerie pour valider l’UX (user story #19). Aucune infrastructure distante n’est encore branchée : tout est simulé en mémoire côté client. Ce document décrit le fonctionnement actuel et la marche à suivre pour connecter un vrai backend.

## 1. Fonctionnement actuel (prototype)

| Domaine              | Implémentation (mock)                                                   |
|----------------------|--------------------------------------------------------------------------|
| Stockage             | `app/services/messages.ts` conserve threads & messages en mémoire        |
| « Chiffrement »      | XOR simple (fonction `encrypt/decrypt`) pour illustrer le concept        |
| Temps réel           | `subscribeThreads` / `subscribeMessages` notifient les listeners JS      |
| Notifications        | Les envois passent par `pushNotification` (service notifications mock)  |
| Historique           | Historique par thread conservé tant que l’app reste en mémoire          |
| Signalement          | `reportMessage` stocke les signalements (affichés dans l’état local)     |

Les threads de démonstration sont injectés via `ensureDemoThreads(email)` pour que chacun puisse tester sans backend.

## 2. Brancher un backend réel

### 2.1 API & stockage
1. Créer un service backend (ex. Node/Fastify, Supabase, Firebase, etc.).
2. Exposer des endpoints ou une API GraphQL :
   - `POST /threads` : créer un thread (avec `rideId`, `participants`…).
   - `GET /threads?user=email` : récupérer les conversations d’un utilisateur.
   - `POST /messages` : envoyer un message (avec chiffrement côté serveur).
   - `POST /messages/{id}/report` : remonter un signalement.
3. Stocker les messages chiffrés (AES-256 par exemple) + métadonnées (timestamp, participants).

### 2.2 Temps réel
- Option 1 : WebSockets maison (ex. adapter le backend Node).
- Option 2 : Service managé (Supabase Realtime, Firebase RTDB/Firestore, Ably, Pusher…).
- Dans `messages.ts`, remplacer les listeners in-memory par un pont vers ce service.

### 2.3 Notifications push
1. Activer Expo Notifications (ou Firebase Cloud Messaging) sur mobile.
2. Enregistrer le `pushToken` utilisateur côté serveur.
3. Lors d’un `POST /messages`, déclencher l’envoi (via SDK Expo, FCM ou APNS).

### 2.4 Modération
1. Côté serveur, stocker les signalements (`messageId`, reporter, reason, date).
2. Mettre en place un job/console d’admin pour traiter ces signalements.
3. Envisager un filtrage automatique (listes noires, AI, etc.).

## 3. Points RGPD / sécurité
- Stocker les participants chiffrés ou pseudonymisés.
- Limiter la durée de conservation des messages (ex. purge après X jours).
- Ajouter un écran « Charte d’utilisation ».
- Documenter la portabilité/suppression des données utilisateurs.

## 4. Tests à prévoir
- Unitaire : serialisation, chiffrement/déchiffrement, formatage des notifications.
- Intégration : envoi/consultation de messages via API réelle.
- E2E : scénarios conducteur ↔ passager + signalement.
- Tests de résistance (flood, message volumineux).

## 5. Prochaines étapes côté front
1. Créer un adapter (`messages.adapter.ts`) pour parler au backend réel.
2. Ajouter la gestion du statut d’envoi (« en cours », « livré »).
3. Afficher les signalements déjà envoyés (icône ou badge).
4. Gérer la pagination de l’historique (chargement différé).

En l’état, l’UX est prête. Il reste à brancher les services distants pour obtenir un module de messagerie complet conforme aux critères de la user story #19.
