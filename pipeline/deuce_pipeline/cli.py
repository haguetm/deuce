"""Command line entry point.

  deuce-pipeline count                     count candidates, propose a threshold
  deuce-pipeline import --limit 200        mini catalogue (most-linked players)
  deuce-pipeline import --min-sitelinks K  full catalogue above the threshold
  deuce-pipeline score                     recompute rarity scores and tiers

Every command is idempotent and writes a journal to pipeline/logs/.
"""
from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

from . import commons, db, images, pageviews, sackmann, scoring, storage, wikidata, wikipedia
from .http import HttpClient
from .journal import Journal

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
THRESHOLDS = [5, 8, 10, 12, 15, 20, 25, 30, 40, 50]
TARGET_RANGE = (2000, 6000)
TARGET = 4000
BATCH = 50


def propose_threshold(counts: dict[int, int]) -> int | None:
    """Sitelinks threshold whose catalogue size is in range and closest to TARGET."""
    in_range = {k: n for k, n in counts.items() if TARGET_RANGE[0] <= n <= TARGET_RANGE[1]}
    if not in_range:
        return None
    return min(in_range, key=lambda k: (abs(in_range[k] - TARGET), k))


def cmd_count(args: argparse.Namespace) -> None:
    journal = Journal("count")
    client = HttpClient()
    counts: dict[int, int] = {}
    for k in [0, *THRESHOLDS]:
        rows = wikidata.run_query(client, wikidata.count_query(k))
        counts[k] = int(rows[0]["n"]["value"])
        journal.info("sitelinks >= %d: %d candidates", k, counts[k])
    proposal = propose_threshold({k: v for k, v in counts.items() if k > 0})
    journal.info("proposed threshold: %s (target %d, range %s)", proposal, TARGET, TARGET_RANGE)
    journal.close()


def _load_sackmann(sackmann_dir: Path, journal: Journal) -> tuple[dict[str, tuple[str, str]], dict]:
    """QID -> (tour, sackmann_id) and stats per (tour, sackmann_id)."""
    by_qid: dict[str, tuple[str, str]] = {}
    stats: dict[tuple[str, str], sackmann.PlayerStats] = {}
    for tour in ("atp", "wta"):
        tour_dir = sackmann_dir / f"tennis_{tour}"
        if not (tour_dir / f"{tour}_players.csv").exists():
            journal.issue("sackmann_missing", None, f"{tour_dir} not found, {tour.upper()} stats skipped")
            continue
        mapping = sackmann.read_players(tour_dir, tour)
        for qid, pid in mapping.items():
            by_qid[qid] = (tour, pid)
        for pid, s in sackmann.compute_stats(tour_dir, tour, set(mapping.values())).items():
            stats[(tour, pid)] = s
        journal.info("sackmann %s: %d players with a Wikidata id", tour, len(mapping))
    return by_qid, stats


def cmd_import(args: argparse.Namespace) -> None:
    journal = Journal("import")
    client = HttpClient()
    store = None if args.skip_images else storage.get_storage()

    rows = wikidata.run_query(client, wikidata.top_candidates_query(args.limit, args.min_sitelinks))
    qids = [qid for qid, _ in wikidata.parse_candidates(rows)]
    journal.info("selected %d candidates", len(qids))

    sack_by_qid, sack_stats = _load_sackmann(Path(args.sackmann_dir), journal)
    start, end = pageviews.window(date.today(), 12)

    with db.connect() as conn:
        for i in range(0, len(qids), BATCH):
            batch = qids[i : i + BATCH]
            details = wikidata.run_query(client, wikidata.details_query(batch))
            for row in details:
                player = wikidata.parse_player(row)
                for problem in player.issues:
                    journal.issue("wikidata", player.qid, problem)
                if not player.name or not player.sex:
                    journal.count("players.skipped")
                    continue
                with conn.transaction(), conn.cursor() as cur:
                    _import_player(cur, client, store, player, sack_by_qid, sack_stats, start, end, args, journal)
                journal.count("players.imported")
            journal.info("progress %d/%d", min(i + BATCH, len(qids)), len(qids))

        with conn.transaction(), conn.cursor() as cur:
            _score(cur, journal)
    journal.close()


def _import_player(cur, client, store, player, sack_by_qid, sack_stats, start, end, args, journal) -> None:
    views = 0
    for project, title in (("en.wikipedia", player.enwiki_title), ("fr.wikipedia", player.frwiki_title)):
        if title:
            views += pageviews.fetch_views(client, project, title, start, end)

    stats_entry = None
    if player.qid in sack_by_qid:
        stats_entry = sack_stats.get(sack_by_qid[player.qid])
    else:
        journal.issue("no_stats", player.qid, "not found in Sackmann players files")

    player_id = db.upsert_player(
        cur, player, views,
        stats_entry.preferred_surface if stats_entry else None,
        (stats_entry.first_year, stats_entry.last_year) if stats_entry else (None, None),
    )
    if stats_entry:
        tour = stats_entry.tour
        db.upsert_stats(cur, player_id, stats_entry.as_stat_rows(), sackmann.SOURCE_ID[tour], sackmann.SOURCE_URL[tour])

    if not args.skip_texts:
        for lang, title in (("fr", player.frwiki_title), ("en", player.enwiki_title)):
            if not title:
                continue
            text = wikipedia.fetch_summary(client, lang, title)
            if text:
                db.upsert_text(cur, player_id, text)
                journal.count(f"texts.{lang}")
            else:
                journal.issue("no_text", player.qid, f"{lang}: empty or disambiguation page")

    if store is None:
        return
    if not player.commons_file:
        journal.issue("no_photo", player.qid, "no image (P18) on Wikidata, silhouette shown")
        return
    image, reason = commons.fetch_image(client, player.commons_file)
    if image is None:
        journal.issue("photo_rejected", player.qid, f"{player.commons_file}: {reason}")
        return
    body, width, height = images.to_card_webp(client.get_bytes(image.thumb_url))
    key = storage.object_key(player.qid, body)
    store.put(key, body, "image/webp")
    db.upsert_primary_image(cur, player_id, image, key, width, height)
    journal.count("photos")


def _score(cur, journal: Journal) -> None:
    cfg = scoring.load_config()
    inputs = [scoring.ScoreInput(qid, {k: float(v) for k, v in stats.items()}, views)
              for qid, views, stats in db.load_score_inputs(cur)]
    scores = scoring.score_catalogue(inputs, cfg)
    db.write_scores(cur, scores)
    for tier, n in scoring.tier_sizes(len(inputs), cfg).items():
        journal.info("tier %s: %d players", tier, n)


def cmd_score(args: argparse.Namespace) -> None:
    journal = Journal("score")
    with db.connect() as conn, conn.transaction(), conn.cursor() as cur:
        _score(cur, journal)
    journal.close()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="deuce-pipeline")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("count", help="count candidates and propose an inclusion threshold").set_defaults(func=cmd_count)

    imp = sub.add_parser("import", help="import players (idempotent)")
    imp.add_argument("--limit", type=int, default=200)
    imp.add_argument("--min-sitelinks", type=int, default=0)
    imp.add_argument("--sackmann-dir", default=str(DATA_DIR))
    imp.add_argument("--skip-images", action="store_true")
    imp.add_argument("--skip-texts", action="store_true")
    imp.set_defaults(func=cmd_import)

    sub.add_parser("score", help="recompute rarity scores and tiers").set_defaults(func=cmd_score)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
