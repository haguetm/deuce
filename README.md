# Deuce

Jeu web gratuit de cartes à collectionner sur les joueurs et joueuses de tennis professionnels (ATP et WTA, toute l'histoire). Nom de travail provisoire : toute l'identité vit dans `config/brand.ts` et `messages/*.json`.

> **Avertissement licence des statistiques.** Les statistiques proviennent du jeu de données de Jeff Sackmann, sous licence **CC BY-NC-SA 4.0 (usage non commercial)**. Le projet reste donc gratuit, sans publicité ni achat. Toute monétisation future impose de remplacer cette source avant (chaque statistique porte une référence à sa source pour faciliter ce remplacement). Voir `docs/DATA.md`.

## Installation (moins de dix minutes)

Prérequis : Node 22, pnpm 10, Docker (pour Supabase local), Python 3.12+ (pour le pipeline).

```bash
pnpm install
cp .env.example .env.local
pnpm db:start          # lance Supabase en local (Docker), affiche les clés
# copier "anon key" et "service_role key" dans .env.local
pnpm dev               # http://localhost:3000 -> redirige vers /fr ou /en
```

## Commandes

| Commande                                     | Rôle                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm dev`                                   | serveur de développement                                                     |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | vérifications lancées aussi par la CI                                        |
| `pnpm build`                                 | build de production                                                          |
| `pnpm db:start` / `pnpm db:stop`             | Supabase local                                                               |
| `pnpm db:reset`                              | rejoue les migrations et le seed                                             |
| `pnpm db:test`                               | tests pgTAP sur Supabase local (référence, lancé par la CI)                  |
| `pnpm config:generate`                       | régénère `supabase/seed-game-config.sql` depuis `config/game.ts`             |
| `pnpm simulate:economy`                      | simulation du gain d'aces par booster (recyclage des doublons)               |
| `pnpm settings:sync`                         | copie les seuils privés (parrainage, anti-abus) de `.env.local` vers la base |
| `pnpm db:test:plain`                         | mêmes tests sans Docker, sur un PostgreSQL local avec pgTAP                  |

## Arborescence

```
config/              marque, paramètres de jeu, poids de rareté
messages/            traductions fr / en (aucun texte en dur dans le code)
src/app/[locale]/    pages (chemins localisés, voir src/i18n/routing.ts)
src/components/      composants UI
src/lib/             clients Supabase, utilitaires
supabase/            config locale, migrations, tests pgTAP
pipeline/            import des données (Python)
tests/               tests unitaires (Vitest), test de charge (k6)
docs/                DECISIONS, LEGAL, DATA
```

## Déploiement

- **Vercel** : importer le dépôt GitHub sur vercel.com (framework Next.js détecté). Chaque push sur une branche crée une preview. Renseigner les variables de `.env.example` dans Project Settings > Environment Variables.
- **Supabase** : projet de production en région UE, migrations appliquées avec `supabase db push`.

## Changer de nom

1. `config/brand.ts` : `name`, `shortName`, `wordmark`, couleurs, logos.
2. `messages/fr.json` et `messages/en.json` : namespace `brand`.
3. Déposer les logos définitifs dans `public/brand/`.

Le test `tests/unit/brand.test.ts` échoue si le nom ou une couleur apparaît en dur dans `src/`.

## Documentation

- `docs/DECISIONS.md` : décisions et hypothèses
- `docs/LEGAL.md` : mentions, licences, attributions et procédure de retrait
- `docs/DATA.md` : sources, licences, mise à jour des données

## Licence

Le code est sous licence MIT (`LICENSE`). Les données et contenus importés (statistiques, extraits de Wikipédia, photos de Wikimedia Commons) restent sous leur licence d'origine, détaillée dans `docs/LEGAL.md` et `docs/DATA.md`. Ils ne sont jamais versionnés dans ce dépôt.

## Sécurité

`pnpm scan:secrets` analyse tout l'historique git avec gitleaks et vérifie que `.gitignore` exclut les fichiers `.env*`, les notes privées (`docs/private/`) et les données téléchargées. La CI lance ce scan sur `main` et sur chaque pull request.
