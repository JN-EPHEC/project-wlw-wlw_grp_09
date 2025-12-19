export const FAQ_ITEMS = [
  {
    id: 'book-ride',
    question: 'Comment réserver un trajet ?',
    answer:
      'Ouvre l’onglet Explore, sélectionne un trajet disponible ou crée une alerte campus. Choisis ton point de rendez-vous, confirme et ton conducteur est notifié instantanément.',
  },
  {
    id: 'become-driver',
    question: 'Comment devenir conducteur ?',
    answer:
      'Rends-toi dans Profil > Vérification conducteur, importe ton permis recto/verso et ta plaque. Dès que l’équipe valide tes documents, le bouton “Publier un trajet” s’active.',
  },
  {
    id: 'cancel-ride',
    question: 'Puis-je annuler un trajet ?',
    answer:
      'Oui, ouvre Profil > Mes trajets puis “Annuler”. Préviens l’autre utilisateur via la conversation intégrée pour éviter un signalement tardif.',
  },
  {
    id: 'payment',
    question: 'Comment fonctionne le paiement ?',
    answer:
      'Le passager paie via l’app. Le montant reste bloqué jusqu’à la fin du trajet, puis ton wallet conducteur est crédité. Programme un retrait mensuel vers ta carte enregistrée.',
  },
  {
    id: 'issue',
    question: 'Que faire en cas de problème pendant un trajet ?',
    answer:
      'Utilise le bouton “Signaler” dans la conversation du trajet ou ouvre la section Aide pour contacter le support (chat, email ou téléphone) en précisant l’horaire et la plaque.',
  },
  {
    id: 'reviews',
    question: 'Comment noter un conducteur ou passager ?',
    answer:
      'Après chaque trajet terminé, une carte “Laisser un avis” apparaît dans Profil. Choisis la note, écris ton commentaire et valide : la réputation est mise à jour instantanément.',
  },
  {
    id: 'privacy',
    question: 'Mes données sont-elles sécurisées ?',
    answer:
      'Oui. CampusRide chiffre les données (TLS), héberge en Europe et limite l’accès à l’équipe support. Tu peux demander l’export ou la suppression de ton compte à tout moment.',
  },
  {
    id: 'edit-profile',
    question: 'Comment modifier mon profil ?',
    answer:
      'Dans l’onglet Profil, touche “Modifier le profil”. Tu peux mettre à jour tes infos, ta photo et tes préférences conducteur/passager : les changements sont instantanés.',
  },
] as const;

export const HELP_TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Écran de bienvenue',
    description: 'Découvre la promesse CampusRide et démarre l’onboarding.',
    route: '/welcome',
  },
  {
    id: 'signup',
    title: 'Création du compte',
    description: 'Inscris-toi avec ton e-mail @students.ephec.be.',
    route: '/sign-up',
  },
  {
    id: 'verify',
    title: 'Vérification e-mail',
    description: 'Confirme ton adresse avant d’accéder à l’app.',
    route: '/verify-email',
  },
  {
    id: 'activated',
    title: 'Compte activé',
    description: 'Récapitulatif avant de compléter ton profil.',
    route: '/account-activated',
  },
  {
    id: 'profile',
    title: 'Profil complet',
    description: 'Ajoute tes infos, ta carte étudiant et ton selfie.',
    route: '/complete-profile',
  },
  {
    id: 'roles',
    title: 'Choix des rôles',
    description: 'Active conducteur/passager depuis l’accueil profil.',
    route: '/profile-welcome',
  },
  {
    id: 'driver-security',
    title: 'Sécurité conducteur',
    description: 'Importe ton permis et ta plaque pour publier.',
    route: '/driver-verification',
  },
  {
    id: 'account-complete',
    title: 'Compte complet',
    description: 'Valide les dernières étapes avant l’accès total.',
    route: '/account-complete',
  },
  {
    id: 'home',
    title: 'Accueil',
    description: 'Gère tes trajets et messages dans les onglets.',
    route: '/(tabs)',
  },
  {
    id: 'profile-tab',
    title: 'Profil',
    description: 'Suis ta réputation, ton wallet et ton aide.',
    route: '/(tabs)/profile',
  },
  {
    id: 'wallet',
    title: 'Wallet',
    description: 'Consulte tes gains et retire ton solde en un clic.',
    route: '/wallet',
  },
  {
    id: 'settings',
    title: 'Paramètres & aide',
    description: 'Personnalise l’app et contacte le support.',
    route: '/settings',
  },
] as const;
