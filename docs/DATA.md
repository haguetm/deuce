# Données : sources, licences, mise à jour

| Source                                 | Usage                      | Licence                                                     | Attribution affichée                                    |
| -------------------------------------- | -------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| Wikidata                               | identité, faits structurés | CC0                                                         | lien vers l'élément                                     |
| Wikipédia FR / EN                      | extraits biographiques     | CC BY-SA 4.0                                                | auteur « contributeurs Wikipédia », lien vers l'article |
| Wikimedia Commons                      | photos                     | variable par fichier (CC BY, CC BY-SA, CC0, domaine public) | auteur, licence, lien, au dos de la carte               |
| API Wikimedia Pageviews                | notoriété (12 mois)        | CC0 (données agrégées)                                      | -                                                       |
| Jeff Sackmann, tennis_atp / tennis_wta (archive Hugging Face) | statistiques de carrière   | **CC BY-NC-SA 4.0**                                         | pied de page et dos de chaque carte                     |

**Avertissement** : la licence Sackmann interdit l'usage commercial. Chaque statistique référence sa source (`data_sources`) pour permettre son remplacement.

## Procédure de mise à jour

Voir `pipeline/README.md`. En résumé :

1. Mettre à jour les données Sackmann dans `pipeline/data/` (`deuce-pipeline fetch-sackmann`).
2. `deuce-pipeline import --min-sitelinks <seuil>` : idempotent, ne touche ni aux raretés corrigées à la main ni aux photos masquées.
3. Lire `pipeline/logs/*-issues.json` et reporter ci-dessous les problèmes nouveaux.
4. `deuce-pipeline score` après tout changement de `config/rarity.json`.

## Règles de traitement

- **Lien Wikidata ↔ Sackmann** : colonne `wikidata_id` des fichiers `atp_players.csv` et `wta_players.csv`. Les joueurs récents n'y ont souvent pas d'identifiant (Mirra Andreeva en 2026) : à défaut, rapprochement sur le nom (accents et ponctuation ignorés) **et** la date de naissance exacte, seulement pour les joueurs Sackmann sans identifiant Wikidata, et jamais quand deux joueurs partagent la même clé. Sans correspondance : pas de statistiques (journalisé en `no_stats`).
- **Qui a une carte** : Wikidata classe « joueur de tennis » des rois, footballeurs ou chanteurs qui ont un jour joué (George VI, Paolo Maldini, Redfoo). Une carte exige des matchs du circuit principal dans les données Sackmann ou l'entrée au Hall of Fame international du tennis (P166 = Q52454). Sinon le joueur n'est pas importé (`not_a_tour_player`) et, s'il était déjà là, sort du catalogue (`in_catalog = false`, jamais remis à `true` automatiquement).
- **Rareté** : `config/rarity.json`, calcul dans `pipeline/deuce_pipeline/scoring.py`. Moitié palmarès (Grand Chelem, finales, semaines n°1, titres, meilleur classement, bonus Hall of Fame qui compense l'absence de statistiques avant 1968), moitié popularité (moitié vues Wikipédia FR + EN sur 12 mois, moitié nombre d'éditions de Wikipédia qui ont un article sur le joueur, une notoriété durable).
- **Titres** : finales gagnées dans les fichiers du circuit principal (`*_matches_YYYY.csv`) aux niveaux ATP `G, M, A, F` et WTA `G, P, PM, I, T1-T5, F`. Coupe Davis, Jeux olympiques, qualifications, challengers et ITF exclus. **Provisoire**, à comparer avec les palmarès officiels sur un échantillon.
- **Semaines au n°1** : nombre de dates de classement où le joueur est n°1. Exact quand le classement est hebdomadaire, approximatif sur les périodes plus anciennes où il ne l'était pas.
- **Pays** : nationalité sportive (P1532) sinon citoyenneté (P27), code ISO à deux lettres. Les pays disparus sans code ISO (URSS, Yougoslavie, Tchécoslovaquie) restent vides et sont journalisés.
- **Dates imprécises** : une date Wikidata au mois ou à l'année près n'est pas complétée, la naissance reste vide.
- **Photos** : licences acceptées CC BY, CC BY-SA, CC0 et domaine public. NC, ND, usage loyal et licences inconnues rejetées. Sans photo Wikidata acceptable, repli sur la photo d'en-tête libre des articles Wikipédia du joueur (jusqu'à 15 langues, anglais et français d'abord), retenue seulement si elle montre un seul visage. Sans aucune photo, le joueur sort du catalogue (`photo_missing`) jusqu'au prochain import qui en trouve une.
- **Photo d'époque** : pour un joueur retraité dont la photo Wikidata (P18) n'est pas datée de sa carrière (date de prise de vue, sinon une année dans le nom du fichier), ou qui n'a pas de photo libre, le pipeline cherche dans sa catégorie Commons (P373, ses sous-catégories datées et « by year ») les photos libres de ses années de jeu. Classement : nom du joueur dans le nom du fichier, puis proximité du pic de carrière (40 % de la carrière). Parmi les 6 premières, la plus nette gagne : un seul visage, le plus grand possible ; les photos de groupe sont écartées. Sans candidate, la photo Wikidata reste.
- **Cadrage** : chaque photo est recadrée au format de la carte (0,85) autour du visage détecté par YuNet (`pipeline/models/face_detection_yunet_2023mar.onnx`, MIT, dépôt `opencv/opencv_zoo`), visage à 36 % du haut ; sans visage, le haut de l'image est gardé.

## Données manquantes ou incertaines

- **2026-10-16 - Accès réseau** : depuis l'environnement de développement cloud, les domaines Wikimedia (`query.wikidata.org`, `*.wikipedia.org`, `commons.wikimedia.org`, `upload.wikimedia.org`, `wikimedia.org`) sont bloqués par la politique réseau, et `raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_players.csv` répond 404. **À vérifier** : disponibilité actuelle des dépôts Sackmann et nom de la branche. Aucun import réel n'a encore eu lieu.
- **2026-10-16 - Limitation Wikimedia** : après ouverture du réseau, Wikimedia refuse les requêtes venant de l'adresse IP partagée de l'environnement cloud (« You are making too many requests », 429 puis 403), y compris Wikidata SPARQL, avec un User-Agent conforme. Le pipeline doit être lancé depuis une machine personnelle. `github.com` reste refusé par le proxy de l'environnement (403), les dépôts Sackmann ne sont donc pas encore vérifiés.
- **Joueurs d'avant l'ère Open** : les fichiers Sackmann sont incomplets avant 1968, leur score de rareté repose davantage sur la notoriété.

- **2026-10-27 - Source des statistiques Sackmann** : les dépôts GitHub `JeffSackmann/tennis_atp` et `tennis_wta` n'existent plus (404). Les données viennent de l'archive publique [Aneeshers/tennis-sackmann-archive](https://huggingface.co/datasets/Aneeshers/tennis-sackmann-archive) (Hugging Face, miroir GitHub `Aneeshers/tennis-sackmann-archive`), mêmes fichiers, même licence CC BY-NC-SA 4.0, données jusqu'en 2026. Téléchargement : `deuce-pipeline fetch-sackmann`. Vérification avant le premier import : fichiers lus par le pipeline tous complets ; palmarès recalculés conformes (Federer 20 titres du Grand Chelem dont 8 Wimbledon, Nadal 22 dont 14 Roland-Garros, Djokovic 24, Serena Williams 23). L'attribution reste à Jeff Sackmann.
