# Données : sources, licences, mise à jour

| Source                                 | Usage                      | Licence                                                     | Attribution affichée                                    |
| -------------------------------------- | -------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| Wikidata                               | identité, faits structurés | CC0                                                         | lien vers l'élément                                     |
| Wikipédia FR / EN                      | extraits biographiques     | CC BY-SA 4.0                                                | auteur « contributeurs Wikipédia », lien vers l'article |
| Wikimedia Commons                      | photos                     | variable par fichier (CC BY, CC BY-SA, CC0, domaine public) | auteur, licence, lien, au dos de la carte               |
| API Wikimedia Pageviews                | notoriété (12 mois)        | CC0 (données agrégées)                                      | -                                                       |
| Jeff Sackmann, tennis_atp / tennis_wta | statistiques de carrière   | **CC BY-NC-SA 4.0**                                         | pied de page et dos de chaque carte                     |

**Avertissement** : la licence Sackmann interdit l'usage commercial. Chaque statistique référence sa source (`data_sources`) pour permettre son remplacement.

## Procédure de mise à jour

Voir `pipeline/README.md`. En résumé :

1. Mettre à jour les clones Sackmann dans `pipeline/data/` (`git pull`).
2. `deuce-pipeline import --min-sitelinks <seuil>` : idempotent, ne touche ni aux raretés corrigées à la main ni aux photos masquées.
3. Lire `pipeline/logs/*-issues.json` et reporter ci-dessous les problèmes nouveaux.
4. `deuce-pipeline score` après tout changement de `config/rarity.json`.

## Règles de traitement

- **Lien Wikidata ↔ Sackmann** : colonne `wikidata_id` des fichiers `atp_players.csv` et `wta_players.csv`. Un joueur sans correspondance n'a pas de statistiques (journalisé en `no_stats`), il n'est pas rapproché par le nom.
- **Titres** : finales gagnées dans les fichiers du circuit principal (`*_matches_YYYY.csv`) aux niveaux ATP `G, M, A, F` et WTA `G, P, PM, I, T1-T5, F`. Coupe Davis, Jeux olympiques, qualifications, challengers et ITF exclus. **Provisoire**, à comparer avec les palmarès officiels sur un échantillon.
- **Semaines au n°1** : nombre de dates de classement où le joueur est n°1. Exact quand le classement est hebdomadaire, approximatif sur les périodes plus anciennes où il ne l'était pas.
- **Pays** : nationalité sportive (P1532) sinon citoyenneté (P27), code ISO à deux lettres. Les pays disparus sans code ISO (URSS, Yougoslavie, Tchécoslovaquie) restent vides et sont journalisés.
- **Dates imprécises** : une date Wikidata au mois ou à l'année près n'est pas complétée, la naissance reste vide.
- **Photos** : licences acceptées CC BY, CC BY-SA, CC0 et domaine public. NC, ND, usage loyal et licences inconnues rejetées. Sans photo acceptable, la carte affiche une silhouette.

## Données manquantes ou incertaines

- **2026-10-16 - Accès réseau** : depuis l'environnement de développement cloud, les domaines Wikimedia (`query.wikidata.org`, `*.wikipedia.org`, `commons.wikimedia.org`, `upload.wikimedia.org`, `wikimedia.org`) sont bloqués par la politique réseau, et `raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_players.csv` répond 404. **À vérifier** : disponibilité actuelle des dépôts Sackmann et nom de la branche. Aucun import réel n'a encore eu lieu.
- **2026-10-16 - Limitation Wikimedia** : après ouverture du réseau, Wikimedia refuse les requêtes venant de l'adresse IP partagée de l'environnement cloud (« You are making too many requests », 429 puis 403), y compris Wikidata SPARQL, avec un User-Agent conforme. Le pipeline doit être lancé depuis une machine personnelle. `github.com` reste refusé par le proxy de l'environnement (403), les dépôts Sackmann ne sont donc pas encore vérifiés.
- **Joueurs d'avant l'ère Open** : les fichiers Sackmann sont incomplets avant 1968, leur score de rareté repose davantage sur la notoriété.
