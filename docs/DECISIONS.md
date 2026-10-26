# Décisions et hypothèses

Chaque entrée : date, décision, raison. Les valeurs marquées **provisoire** sont à revoir.

## Infrastructure

- **2026-10-15 - Supabase local pour le développement.** Supabase CLI + Docker, gratuit et sans quota. Un seul projet cloud (production, région UE), créé par le développeur. Le plan gratuit autorise 2 projets actifs et met en pause un projet inactif 7 jours (sans effet en production avec du trafic).
- **2026-10-15 - Images sur Cloudflare R2.** La bande passante sortante de Supabase Storage (plan gratuit, environ 5 Go/mois) sature lors d'un pic viral. R2 : 10 Go gratuits, sortie gratuite. Couche d'abstraction : `IMAGE_STORAGE_PROVIDER=r2|supabase`.
- **2026-10-15 - Next.js 16, `cacheComponents` désactivé.** L'ISR classique suffit au MVP et simplifie l'intégration next-intl. À réévaluer après le MVP.
- **2026-10-15 - Next.js à la racine du dépôt** (pas de dossier `app/`), `pipeline/`, `supabase/` et `docs/` à côté. Une seule installation pnpm.
- **2026-10-15 - Aucun cookie pour les visiteurs anonymes.** La langue est dans l'URL (`localeCookie: false`). Seuls les cookies de session Supabase (strictement nécessaires) existeront après connexion.
- **2026-10-15 - Services gratuits par défaut** : Umami Cloud (analytics sans cookie), Sentry gratuit (erreurs), limitation de débit en Postgres (pas de Redis).
- **Vercel Hobby** : réservé à un usage personnel non commercial. Compatible tant que le projet reste gratuit. Monétisation = passage à Pro (environ 20 $/mois).

## Base de données

- **2026-10-15 - Écritures uniquement côté serveur.** `anon` et `authenticated` n'ont que le droit SELECT, filtré par RLS. Toute écriture passe par une fonction SECURITY DEFINER ou par la clé de service. Un test pgTAP vérifie qu'aucune table publique n'est modifiable par un client et liste les seules fonctions appelables.
- **2026-10-16 - Recto public, verso réservé.** Le recto (photo non masquée avec son crédit, nom, drapeau, rareté) est lisible par tous. Le verso (statistiques, biographie, extraits Wikipédia) n'est lisible que par les propriétaires de la carte, au niveau de la base. Remplace la décision du 15/10 qui réservait aussi la photo.
- **2026-10-15 - Photo masquée = invisible partout.** La politique RLS exclut `hidden = true` pour tout le monde sauf les admins. Le masquage passe par `admin_set_image_hidden` (un appel) et laisse une trace dans `admin_audit_log`.
- **2026-10-15 - Correction de rareté en SQL** (`update players set rarity_override = ...`). La rareté calculée reste intacte, `rarity_effective` sert au tirage, et un trigger journalise la correction.
- **2026-10-15 - Registre protégé par la base** : aucune mise à jour, aucune suppression (sauf cascade de suppression de compte, RGPD), solde négatif refusé par un trigger sérialisé par utilisateur, clé d'idempotence unique.
- **2026-10-15 - Collection en compteurs** (`user_cards.quantity`) : les copies d'une carte sont identiques, le marché de la phase 2 échange des quantités.
- **2026-10-15 - Demandes de retrait insérées par une route serveur** (Turnstile + limitation de débit), aucune insertion directe par un client.
- **2026-10-15 - Tests de base sans Docker.** Le conteneur de développement ne peut pas télécharger les images Supabase. `pnpm db:test:plain` lance les migrations et les tests pgTAP sur un PostgreSQL local avec une émulation minimale de Supabase (`scripts/db/supabase-shim.sql`). La CI exécute le vrai Supabase (`supabase test db`), qui fait référence.

- **2026-10-16 - Seuils du parrainage et de l'anti-abus hors du dépôt.** Le dépôt est public. Les seuils et poids viennent de variables d'environnement (noms dans `src/lib/server/private-settings.ts`, valeurs génériques dans `.env.example`), copiés par `pnpm settings:sync` dans `private.settings`, schéma non exposé par l'API et illisible pour les clients. Un paramètre manquant fait échouer la fonction de jeu au lieu de désactiver la protection. Les récompenses (boosters offerts) restent publiques : les joueurs doivent savoir ce qu'ils gagnent.

- **2026-10-16 - Pipeline en Python, écriture directe en Postgres** (`DATABASE_URL`), upserts sur clés naturelles, corrections manuelles jamais écrasées. Sélection du mini-catalogue par nombre d'éditions Wikipédia (`wikibase:sitelinks`), même critère que le seuil du catalogue complet.
- **2026-10-16 - Stockage local des images en développement** (`IMAGE_STORAGE_PROVIDER=local`, fichiers dans `public/card-images/`, ignorés par git). La base ne stocke que la clé de l'objet, l'URL publique vient de `NEXT_PUBLIC_IMAGE_BASE_URL`.

- **2026-10-16 - Conservation des données.** Journal d'audit : 3 ans puis suppression. Demandes de retrait : nom, email et motif effacés 12 mois après traitement, sauf litige (`dispute`), l'enregistrement anonymisé est conservé. Purge quotidienne `private.purge_expired_data()` planifiée par pg_cron (03:17 UTC), elle-même journalisée.
- **2026-10-16 - Débit du pipeline** : une requête par seconde et par hôte par défaut (`PIPELINE_MIN_INTERVAL_S`), User-Agent `DeuceDataPipeline/0.1 (<PIPELINE_CONTACT>)`, contact lu dans l'environnement.

- **2026-10-16 - Données de développement fictives** (`pnpm db:seed:dev`) : 100 joueurs aux noms inventés, sans photo, statistiques plausibles, toutes les raretés représentées. Lignes marquées `players.is_dev_seed`. Un trigger refuse ces lignes sauf si la transaction déclare `app.environment = 'development'`, ce que seul le script de dev fait ; le script refuse toute base non locale. Aucune migration ni seed de production ne les contient (testé).

- **2026-10-16 - Connexion (tâche 4a)** : Discord (en premier), Google, lien magique par email, via Supabase Auth et `@supabase/ssr`. Le proxy ne rafraîchit la session que si un cookie Supabase existe : aucun cookie pour les visiteurs anonymes. L'en-tête lit la session côté navigateur pour que les pages publiques restent statiques et cachables. Case d'âge, Turnstile et pseudo restent pour la tâche 4b.
- **2026-10-16 - Révélation des boosters (tâche 6)** : le serveur tire et enregistre les 5 cartes avant tout affichage ; le client ne fait que la mise en scène (machine d'état testée). Ordre de révélation par slot, la carte garantie en dernier ; lueur de la couleur de rareté avant de retourner une carte Épique ou mieux ; finition holographique discrète à partir d'Épique ; animations coupées avec `prefers-reduced-motion`. Un identifiant de requête est conservé jusqu'à la réponse du serveur : un nouvel essai après une coupure réseau rejoue la même ouverture.
- **2026-10-16 - Aperçu de développement** `/fr/dev/booster` : révélation sur joueurs fictifs sans Supabase, désactivé en production (sauf `ENABLE_DEV_PREVIEW=1`).

## Jeu

- **2026-10-15 - Aces contre booster** : 100 aces = 1 booster bonus, 3 par jour maximum. Un script de simulation vérifie que le gain moyen d'aces par booster reste nettement sous 100 (aucune boucle de boosters gratuits).
- **2026-10-15 - Garantie de rareté** : slots 1 à 4 sur la table standard, slot 5 sur la table « Peu commune ou mieux » renormalisée. La page des probabilités affiche le taux par slot et le taux global par booster.
- **2026-10-15 - Boosters thématiques reportés en phase 2.** Seule l'« édition Open d'Australie » existe au MVP (filtre dans la config). Albums automatiques limités à la nationalité.
- **2026-10-16 - Paramètres de jeu dans `config/game.ts`**, copiés dans `public.game_config` par le fichier généré `supabase/seed-game-config.sql` (`pnpm config:generate`). Un test échoue si le fichier généré n'est pas à jour. En production, appliquer ce fichier avec psql après chaque changement.
- **2026-10-16 - Tirage** : graine de 32 octets générée par le serveur et conservée pour chaque ouverture, tirages dérivés par HMAC-SHA256 (rejouables pour audit). Rareté selon la table, puis carte uniforme dans le tier. Le slot 5 utilise toujours la table « Peu commune ou mieux » renormalisée. Si un tier est vide, l'ouverture échoue au lieu de fausser les taux affichés.
- **2026-10-16 - Recharge paresseuse** : +1 booster toutes les 15 minutes, calculé à la lecture ; le minuteur ne tourne pas quand le stock est plein. `open_booster` verrouille la ligne `booster_state` du joueur : 6 ouvertures simultanées sur un stock de 1 donnent 1 succès et 5 refus (vérifié en local).
- **2026-10-16 - Idempotence des ouvertures** : identifiant de requête fourni par le client, unique par joueur ; un rejeu renvoie la première ouverture.
- **Valeurs de recyclage (provisoire)** : Commune 1, Peu commune 3, Rare 8, Épique 25, Légendaire 80, Mythique 400 aces. Simulation (`pnpm simulate:economy`, catalogue de 4 000 cartes) : environ 1 ace par booster sur les 100 premiers, 12 à 15 entre 100 et 1 000, 30 entre 1 000 et 10 000, plafond théorique 31,7 aces par booster quand toutes les cartes sont des doublons, soit 31,7 % du prix d'un booster en aces. Il faut au moins 3,2 boosters gratuits pour en financer un : aucune boucle de boosters gratuits.
- **Règle : relancer `pnpm simulate:economy` à chaque nouvelle source d'aces** (parrainage, succès, quêtes, marché…) et l'intégrer au modèle (`src/lib/game/economy.ts`). Le test `tests/unit/economy-sources.test.ts` échoue tant qu'une raison de crédit écrite par du code SQL n'est pas listée dans `SIMULATED_ACE_SOURCES`.

- **2026-10-26 - Inspiration Kyara et WikiMasters** (étude du 25/10, 31 idées validées sur 32, la séquence « devine le joueur » est refusée). Rapport dans les notes de session, pas dans le dépôt.
- **2026-10-26 - Booster doré** : chaque booster standard (gratuit, bonus, aces, du jour) a 3 % de chances d'être doré, garanti au 30e sans booster doré ; dernière carte « 3e rareté » (rare) ou mieux. Tirage dérivé de la graine (`rand_unit(seed, 'golden')`), compteur `booster_state.golden_counter`. Environ un booster doré tous les 20.
- **2026-10-26 - Garantie de rareté maximale** : le 300e booster standard d'affilée sans carte mythique force la dernière carte en mythique (`mythic_counter`, `booster_openings.mythic_pity`). Les taux naturels ne changent pas.
- **2026-10-26 - Thèmes et choix du booster** : le joueur choisit Tous, Messieurs ou Dames (clés `all`, `men`, `women`, aucune marque ; « Légendes » retiré le 26/10, trop facile à compléter) pour ses boosters gratuits (même stock, mêmes taux). Booster du jour gratuit (heure de Paris), thème du calendrier du tennis sinon rotation, dernière carte rare ou mieux. Un thème ne change jamais les taux de rareté : si un thème n'a aucune carte de la rareté tirée, la carte vient de tout le catalogue de cette rareté.
- **2026-10-26 - Boutique en aces** : Coffret (20 cartes, une épique ou mieux, 450 aces, 1 par semaine) et Qualifs (3 cartes jusqu'à rare, 40 aces, 3 par jour). Recyclage maximal : 33 % et 19 % de leur prix.
- **2026-10-26 - Recyclage** : en lot jusqu'à rare par défaut (`recycle.bulk_max_rarity`), carte par carte au-dessus. Une copie est toujours gardée ; une copie gradée compte comme copie gardée. Chaque recyclage est rejouable (`recycle_events`, identifiant de requête).
- **2026-10-26 - Missions et série** : progression recalculée à partir des tables du jeu (jamais stockée), seules les réclamations sont enregistrées (`quest_claims`). Série de 7 jours avec un jour manqué toléré par semaine ; 3 missions du jour identiques pour tous (tirage par date) ; missions d'accueil et succès une seule fois. Nouvelles sources d'aces `login_streak`, `quest`, `achievement` modélisées dans la simulation : revenus fixes au plus 52 aces par jour, sous le prix d'un booster en aces.
- **2026-10-26 - Essai sans compte** : connexion anonyme Supabase après un clic explicite, 2 boosters gratuits, puis liaison Discord, Google ou email (`linkIdentity`, `updateUser`). Les comptes d'essai ne reçoivent ni booster du jour, ni récompense, ni parrainage avant liaison. Purge des comptes d'essai inactifs depuis 30 jours.
- **2026-10-26 - Parrainage** : récompenses publiques en boosters bonus (3 pour chacun, paliers à 5, 10 et 20 amis, badges Recruteur et Ambassadeur) ; qualification par les seuils privés existants (email confirmé, boosters ouverts, âge du compte, plafonds). Le score anti-abus (`abuse_*`) reste à brancher.
- **2026-10-26 - Gradation** : note de 6 à 10 tirée à l'envoi mais illisible avant 24 h (aucun droit SELECT sur `graded_cards`), frais en aces par rareté, 3 gradations simultanées. Nouvelle raison de débit `grading`.
- **2026-10-26 - Social** : pseudo affiché seulement s'il est choisi, fil des gros tirages et profil public désactivables ; partage d'un tirage par lien (l'ouverture n'est publique qu'après « Partager ») avec image d'aperçu sans photo (les crédits ne pourraient pas y figurer).
- **2026-10-26 - Notifications** : Web Push facultatif (clés VAPID), rappel « stock plein » une fois par cycle et rappel de série le soir. pg_cron appelle `/api/push/dispatch` via pg_net toutes les 10 minutes si `push_dispatch_url` et `push_dispatch_secret` sont synchronisés.
- **2026-10-26 - Raretés affichées** : code court par rareté (`rarityShort` dans `messages/`) et couleur de rareté sur le cadre, les filtres et les albums. Les noms suivent `messages/*.json`.
- **2026-10-26 - Collection** : numéro de catalogue = rang par identifiant parmi les cartes du catalogue (stable tant que le catalogue ne fait que grandir). Albums par nation (au moins 5 cartes) et collections choisies (`collections` dans `config/game.ts`). Le pipeline compte désormais les titres par tournoi du Grand Chelem.

- **2026-10-26 - Ouverture en tube de balles** (conception `docs/superpowers/specs/2026-10-26-booster-tube-3d-design.md`) : tube en 3D (Three.js 0.186.1, chargé seulement sur la page Boosters) dont on arrache l'opercule ; repli automatique sur un tube SVG si WebGL manque, si le rendu passe par le processeur (`failIfMajorPerformanceCaveat`, nom du moteur de rendu) ou si la fluidité au repos tombe sous 24 images par seconde ; fondus seulement avec `prefers-reduced-motion`. Les cartes sortent face visible, empilées ; le halo indique une paire de raretés (3 niveaux pour 6 raretés, `glowTiers`) et ne change jamais, le cadre indique la rareté exacte une fois la carte au-dessus. Les cartes couvertes ne laissent voir aucune rareté (`CardFront concealed`).

## Planning phase 1 (11 semaines utiles, absence du 26/12 au 03/01)

| Semaine | Dates        | Contenu                                                                          | h    |
| ------- | ------------ | -------------------------------------------------------------------------------- | ---- |
| S1      | 15-21 oct    | Socle, CI, preview Vercel ; début schéma                                         | 10   |
| S2      | 22-28 oct    | Schéma, RLS et tests ; mini-pipeline (200 joueurs) ; auth Discord + email        | 10.5 |
| S3      | 29 oct-4 nov | Tirage SQL, tests de distribution, simulation de l'économie ; recto de carte     | 10   |
| S4      | 5-11 nov     | UI d'ouverture, révélation, historique ; recto fini. **Boucle jouable**          | 9.5  |
| S5      | 12-18 nov    | Pipeline complet (1/2)                                                           | 10   |
| S6      | 19-25 nov    | Pipeline complet (2/2) ; auth Google, Turnstile, âge, pseudo                     | 10   |
| S7      | 26 nov-2 déc | Recyclage, registre, aces contre booster ; collection et albums                  | 9    |
| S8      | 3-9 déc      | Verso de carte ; page joueur et probabilités ; édition AO ; analytics et erreurs | 10.5 |
| S9      | 10-16 déc    | Parrainage ; images de partage ; PWA et accessibilité                            | 10   |
| S10     | 17-23 déc    | Pages légales et retrait ; admin ; RGPD                                          | 10   |
| -       | 24 déc-3 jan | Absence                                                                          | 0    |
| S11     | 4-10 jan     | Fin RGPD et PWA ; test de charge et rapport ; production ; marge                 | 10   |
| S12     | 11-17 jan    | Lancement, corrections uniquement                                                | -    |

Total : environ 108 h de travail + **2 h de marge (non consommée)**. Coupes de secours, dans l'ordre : format 1080x1920 réservé aux tirages (-1 h), correction de rareté via Supabase Studio (-1 h), suppression des albums au profit des filtres (-2 h).

## Suivi des estimations

Alerte si une tâche dépasse son estimation de plus de 30 %. Le temps constaté est une estimation de l'effort équivalent pour un développeur solo (code + relecture), à corriger avec ton temps réel de relecture.

| Tâche                 | Estimé | Constaté | Écart | Note                                                                    |
| --------------------- | ------ | -------- | ----- | ----------------------------------------------------------------------- |
| T1 Socle, CI, preview | 6,5 h  | 6,5 h    | 0 %   |                                                                         |
| T2 Schéma, RLS, pgTAP | 6 h    | 7 h      | +17 % | Docker indisponible en conteneur : banc de test PostgreSQL local ajouté |

| T3a Mini-pipeline (200 joueurs) | 5 h | 4,5 h (code, tests, débit) | en cours | import réel bloqué : Wikimedia limite l'IP partagée du conteneur |
| Hors plan : recto public, conservation des données | - | 1,5 h | - | demandes du 16/10, prises sur la marge |
| T5 Tirage SQL, tests, simulation | 8,5 h | 7 h | -18 % | |
| Hors plan : graine illisible, contrôles docs et économie | - | 1 h | - | demandes du 16/10 |
| Hors plan : données fictives de dev, scripts d'import bash/PowerShell | - | 1,5 h | - | demandes du 16/10 |
| T4a Connexion Discord, Google, email | 3 h | 2 h | -33 % | Google avancé depuis T4b |
| T6 Interface d'ouverture et révélation | 8 h | 6,5 h | -19 % | parcours réel non testé de bout en bout (pas de Supabase dans le conteneur) |

Marge restante : **-1,5 h**. Les ajouts hors plan du 16/10 (4 h) dépassent la marge de 2 h ; les tâches 4a, 5 et 6 ont rendu 4 h sur leurs estimations. Bilan net du planning : +0,5 h d'avance.
