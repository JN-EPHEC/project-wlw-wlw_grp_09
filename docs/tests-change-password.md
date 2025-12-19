# Tests - Changement de mot de passe

Ces tests ont été réalisés manuellement dans l'application Expo afin de couvrir les scénarios demandés (cas nominal, messages d'erreur, retour vers l'écran précédent).

## Pré-requis
- Utilisateur connecté avec un mot de passe connu (`motdepasseActuel!1`).
- Accès à l'écran Paramètres → "Changer le mot de passe".

## Cas nominal
1. Depuis Paramètres, ouvrir "Changer le mot de passe".
2. Renseigner l'ancien mot de passe valide.
3. Choisir un nouveau mot de passe respectant les critères (min 8, 1 majuscule, 1 chiffre) et le confirmer.
4. Le bouton "Enregistrer" s'active et, au tap, affiche "Mise à jour en cours…".
5. À la fin, une alerte indique "Mot de passe mis à jour" puis retour automatique à Paramètres.
6. Déconnexion / reconnexion possible uniquement avec le nouveau mot de passe.

✅ Résultat: succès, mot de passe mis à jour et session conservée.

## Erreur critère mot de passe
1. Entrer un nouveau mot de passe court (ex: `abcd`).
2. Le message "Min. 8 caractères, 1 majuscule et 1 chiffre." apparaît sous le champ, le bouton reste désactivé.

✅ Résultat: impossible de soumettre, message clair.

## Erreur confirmation
1. Entrer un mot de passe valide dans "Nouveau" mais un différent dans "Confirmer".
2. Le message "Les nouveaux mots de passe doivent être identiques" apparaît, bouton inactif.

✅ Résultat: correction nécessaire avant soumission.

## Erreur ancien mot de passe
1. Entrer un ancien mot de passe volontairement incorrect.
2. Soumettre.
3. Une alerte affiche "Mot de passe actuel incorrect." (renvoyée par le backend).

✅ Résultat: mot de passe non changé.

## Retour écran précédent
1. Après un changement réussi, vérifier le retour automatique vers Paramètres.
2. Appuyer sur la flèche "chevron" pour revenir manuellement.

✅ Résultat: navigation fiable et retour à Paramètres.

Ces scénarios couvrent les trois axes requis (nominal, erreurs, navigation). Aucun bug observé.
