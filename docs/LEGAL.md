# Checklist juridique

Document de travail destiné à un audit par un avocat. Statut : ✅ fait, 🟡 en cours, ⬜ à faire, ⚖️ à valider par un avocat.

## Monnaie et loot boxes

- ⬜ Aucune route ni dépendance de paiement (vérifié à chaque livraison).
- ⬜ Les aces se gagnent uniquement en jouant, ne s'achètent pas, ne se convertissent pas.
- ⚖️ Confirmer que le régime JONUM ne s'applique pas tant qu'aucune valeur monétaire n'entre ni ne sort.

## Images de personnes réelles

- ⬜ Uniquement Wikimedia Commons sous licence libre compatible, métadonnées stockées.
- ⬜ Crédit au dos de chaque carte et sur la fiche.
- ✅ Champ `hidden`, masquage en un appel (`admin_set_image_hidden`), photo masquée invisible au niveau de la base, action journalisée.
- ⚖️ Droit à l'image des joueurs : la licence libre ne couvre que le droit d'auteur du photographe.

## Marques et contenus officiels

- ✅ Mention « projet de fans non officiel » dans le pied de page de chaque page.
- ⬜ Aucun logo ATP, WTA, Grand Chelem ou tournoi ; noms en texte brut uniquement.
- ⚖️ Vérifier le nom « Deuce » en marque (INPI, EUIPO) avant lancement.

## Licences de contenu

- ✅ Attribution Sackmann (CC BY-NC-SA 4.0) et Wikipédia (CC BY-SA 4.0) dans le pied de page.
- ⬜ Attribution sur chaque dos de carte et chaque extrait.
- ⚖️ CC BY-NC-SA : le partage à l'identique s'applique-t-il aux statistiques affichées ? Hypothèse : oui, elles sont republiées sous la même licence.

## RGPD et cookies

- ✅ Aucun cookie pour les visiteurs anonymes (langue dans l'URL).
- ⬜ Politique de confidentialité, mentions légales, CGU, page cookies (emplacements éditeur à compléter).
- ⬜ Export et suppression de compte en libre-service.
- ✅ Minimisation : `profiles` ne contient que pseudo, langue, date de confirmation d'âge et code de parrainage ; email et identité OAuth restent dans `auth.users`.
- ✅ Suppression de compte : cascade sur toutes les données de jeu, registre compris.
- ⚖️ Durée de conservation des demandes de retrait (nom et email du demandeur) et du journal d'audit. Proposition : 3 ans après traitement.
- ⚖️ Base légale et durée de conservation des journaux (anti-abus, parrainage).

## Mineurs

- ⬜ Case « 15 ans ou plus, ou accord parental » à l'inscription.
- ⬜ Aucune messagerie privée au MVP.

## Transparence

- ⬜ Page publique des probabilités (par rareté, par slot, par carte).
