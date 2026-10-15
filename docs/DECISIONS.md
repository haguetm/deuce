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

## Jeu

- **2026-10-15 - Aces contre booster** : 100 aces = 1 booster bonus, 3 par jour maximum. Un script de simulation vérifie que le gain moyen d'aces par booster reste nettement sous 100 (aucune boucle de boosters gratuits).
- **2026-10-15 - Garantie de rareté** : slots 1 à 4 sur la table standard, slot 5 sur la table « Peu commune ou mieux » renormalisée. La page des probabilités affiche le taux par slot et le taux global par booster.
- **2026-10-15 - Boosters thématiques reportés en phase 2.** Seule l'« édition Open d'Australie » existe au MVP (filtre dans la config). Albums automatiques limités à la nationalité.
- **Valeurs de recyclage (provisoire)** : définies dans `config/game.ts` (tâche 5), validées par la simulation.

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

Total : environ 108 h de travail + 2 h de marge. Coupes de secours, dans l'ordre : format 1080x1920 réservé aux tirages (-1 h), correction de rareté via Supabase Studio (-1 h), suppression des albums au profit des filtres (-2 h).
