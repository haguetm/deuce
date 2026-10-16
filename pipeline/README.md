# Pipeline de données

Construit le catalogue de cartes depuis des sources ouvertes. Chaque commande est idempotente (relancer donne la même base) et écrit un journal dans `pipeline/logs/` : un fichier `.log` et un fichier `-issues.json` qui liste les données manquantes ou rejetées.

## Installation

```bash
cd pipeline
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
```

Variables d'environnement (voir `.env.example` à la racine) :

| Variable | Rôle |
|---|---|
| `PIPELINE_CONTACT` | email ou URL de contact, obligatoire dans le User-Agent (politique Wikimedia) |
| `DATABASE_URL` | connexion Postgres directe (local : `postgresql://postgres:postgres@127.0.0.1:54322/postgres`) |
| `IMAGE_STORAGE_PROVIDER` | `local` (développement), `r2` (production) ou `supabase` |

Données Sackmann (jamais versionnées, licence CC BY-NC-SA 4.0) :

```bash
git clone --depth 1 https://github.com/JeffSackmann/tennis_atp pipeline/data/tennis_atp
git clone --depth 1 https://github.com/JeffSackmann/tennis_wta pipeline/data/tennis_wta
```

## Commandes

```bash
.venv/bin/deuce-pipeline count                       # compte les candidats, propose un seuil (2 000 à 6 000 joueurs)
.venv/bin/deuce-pipeline import --limit 200          # mini-catalogue : les 200 joueurs les plus présents sur Wikipédia
.venv/bin/deuce-pipeline import --min-sitelinks 15   # catalogue complet au-dessus du seuil
.venv/bin/deuce-pipeline score                       # recalcule scores et raretés (après un réglage de config/rarity.json)
```

Options d'`import` : `--skip-images`, `--skip-texts`, `--sackmann-dir`.

## Ce que fait `import`

1. Sélection des candidats sur Wikidata (métier « joueur de tennis » et article Wikipédia FR ou EN), triés par nombre d'éditions Wikipédia.
2. Faits structurés Wikidata : nom, sexe, naissance, pays (ISO), main, taille, photo, années de carrière.
3. Statistiques Sackmann reliées par la colonne `wikidata_id` : meilleur classement, semaines n°1, titres, titres et finales du Grand Chelem, victoires et défaites, surface de prédilection.
4. Pages vues Wikipédia FR + EN sur les 12 derniers mois complets.
5. Extraits Wikipédia FR et EN avec URL et numéro de révision (attribution CC BY-SA).
6. Photo Commons : licence filtrée (CC BY, CC BY-SA, CC0, domaine public ; NC et ND rejetées), auteur et licence stockés, redimensionnement à 400 px en WebP sans métadonnées EXIF, envoi vers le stockage.
7. Score de rareté et tiers selon `config/rarity.json`.

Les corrections manuelles survivent à un nouvel import : `rarity_override`, `in_catalog` et le masquage des photos ne sont jamais écrasés.

## Tests

```bash
.venv/bin/python -m pytest      # parsers, score, images, idempotence sur une vraie base PostgreSQL
```

Les tests utilisent uniquement des joueurs fictifs.
