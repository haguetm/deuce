"""Command line entry point.

  deuce-pipeline count                     count candidates, propose a threshold
  deuce-pipeline import --limit 200        mini catalogue (most-linked players)
  deuce-pipeline import --min-sitelinks K  full catalogue above the threshold
  deuce-pipeline score                     recompute rarity scores and tiers
  deuce-pipeline fetch-sackmann            download the Sackmann data archive

Every command is idempotent and writes a journal to pipeline/logs/.
"""
from __future__ import annotations

import argparse
import os
from datetime import date
from pathlib import Path

import httpx

from . import commons, db, images, pageviews, sackmann, scoring, storage, wikidata, wikipedia
from .http import GaveUp, HttpClient
from .journal import Journal

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
THRESHOLDS = [5, 8, 10, 12, 15, 20, 25, 30, 40, 50]
TARGET_RANGE = (2000, 6000)
TARGET = 4000
BATCH = 50
# Era photos downloaded per player at most, looking for a visible face.
ERA_CANDIDATES = 6
# Pass the "tour statistics or Hall of Fame" rule without being players.
NOT_PLAYERS = {
    "Q52890": "Gustaf V of Sweden, in the Hall of Fame as a contributor",
    "Q640916": "Gianni Clerici, in the Hall of Fame as a journalist",
    "Q1000491": "Bud Collins, in the Hall of Fame as a journalist",
    "Q433293": "Ted Tinling, in the Hall of Fame as a fashion designer",
    "Q708881": "Arthur Nielsen, in the Hall of Fame as a contributor (market research)",
}


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


def _load_sackmann(sackmann_dir: Path, journal: Journal) -> tuple[dict, dict, dict]:
    """QID -> (tour, sackmann_id), (name, birth date) -> (tour, sackmann_id)
    for players without a Wikidata id, and stats per (tour, sackmann_id)."""
    by_qid: dict[str, tuple[str, str]] = {}
    by_identity: dict[tuple[str, str], tuple[str, str]] = {}
    stats: dict[tuple[str, str], sackmann.PlayerStats] = {}
    for tour in ("atp", "wta"):
        tour_dir = sackmann_dir / f"tennis_{tour}"
        if not (tour_dir / f"{tour}_players.csv").exists():
            journal.issue("sackmann_missing", None, f"{tour_dir} not found, {tour.upper()} stats skipped")
            continue
        mapping = sackmann.read_players(tour_dir, tour)
        identities = sackmann.read_identities(tour_dir, tour)
        for qid, pid in mapping.items():
            by_qid[qid] = (tour, pid)
        for key, pid in identities.items():
            # Same person on both tours is impossible; same key twice means ambiguity.
            by_identity[key] = (tour, pid) if key not in by_identity else ("", "")
        pids = set(mapping.values()) | set(identities.values())
        for pid, s in sackmann.compute_stats(tour_dir, tour, pids).items():
            stats[(tour, pid)] = s
        journal.info("sackmann %s: %d players with a Wikidata id, %d by name and birth date",
                     tour, len(mapping), len(identities))
    return by_qid, by_identity, stats


def _sackmann_entry(player, sack_by_qid, sack_by_identity, sack_stats):
    if player.qid in sack_by_qid:
        return sack_stats.get(sack_by_qid[player.qid])
    if player.birth_date is None:
        return None
    key = sackmann.identity_key(player.name, player.birth_date.strftime("%Y%m%d"))
    return sack_stats.get(sack_by_identity.get(key, ("", "")))


def cmd_import(args: argparse.Namespace) -> None:
    journal = Journal("import")
    client = HttpClient()
    store = None if args.skip_images else storage.get_storage()

    rows = wikidata.run_query(client, wikidata.top_candidates_query(args.limit, args.min_sitelinks))
    qids = [qid for qid, _ in wikidata.parse_candidates(rows)]
    journal.info("selected %d candidates", len(qids))

    sack = _load_sackmann(Path(args.sackmann_dir), journal)
    start, end = pageviews.window(date.today(), 12)

    with db.connect() as conn:
        for i in range(0, len(qids), BATCH):
            batch = qids[i : i + BATCH]
            details = wikidata.fetch_details(client, batch)
            for row in details:
                player = wikidata.parse_player(row)
                for problem in player.issues:
                    journal.issue("wikidata", player.qid, problem)
                if not player.name or not player.sex:
                    journal.count("players.skipped")
                    continue
                stats_entry = _sackmann_entry(player, *sack)
                # "Tennis player" on Wikidata includes kings and footballers who
                # once played: a card needs tour matches or the Hall of Fame.
                if player.qid in NOT_PLAYERS or (stats_entry is None and not player.hall_of_fame):
                    journal.issue("not_a_tour_player", player.qid, NOT_PLAYERS.get(
                        player.qid, f"{player.name}: no tour statistics, not in the Hall of Fame"))
                    with conn.transaction(), conn.cursor() as cur:
                        db.exclude_player(cur, player.qid)
                    journal.count("players.skipped")
                    continue
                # One unreachable page must not stop a run of several hours:
                # the player is rolled back and the next run picks them up.
                try:
                    with conn.transaction(), conn.cursor() as cur:
                        _import_player(cur, client, store, player, stats_entry, start, end, args, journal)
                except GaveUp as exc:
                    journal.issue("http_failed", player.qid, str(exc))
                    journal.count("players.failed")
                    continue
                journal.count("players.imported")
            journal.info("progress %d/%d", min(i + BATCH, len(qids)), len(qids))

        with conn.transaction(), conn.cursor() as cur:
            _score(cur, journal)
    journal.close()


def _import_player(cur, client, store, player, stats_entry, start, end, args, journal) -> None:
    views = 0
    for project, title in (("en.wikipedia", player.enwiki_title), ("fr.wikipedia", player.frwiki_title)):
        if title:
            views += pageviews.fetch_views(client, project, title, start, end)

    if stats_entry is None:
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
    career = (player.career_start_year or (stats_entry.first_year if stats_entry else None),
              player.career_end_year or (stats_entry.last_year if stats_entry else None))
    image, raw = _choose_photo(client, player, career, journal)
    if image is None:
        return
    body, width, height = images.to_card_webp(raw)
    key = storage.object_key(player.qid, body)
    store.put(key, body, "image/webp")
    db.upsert_primary_image(cur, player_id, image, key, width, height)
    journal.count("photos")


def _choose_photo(client, player, career, journal):
    """Wikidata's photo, unless the player has retired and that photo is not
    from their career (or is missing or not free): then a dated photo of their
    playing years from their Commons category, alone and face visible."""
    primary = None
    if player.commons_file:
        primary, reason = commons.fetch_image(client, player.commons_file)
        if primary is None:
            journal.issue("photo_rejected", player.qid, f"{player.commons_file}: {reason}")
    start, end = career
    retired = end is not None and end < date.today().year - 1
    if (start and end and player.commons_category
            and (primary is None or (retired and not commons.is_era_photo(primary.year, career)))):
        # Among the best ranked, the clearest single face wins.
        best = None
        candidates = commons.era_photos(client, player.commons_category, (start, end), player.name)
        for candidate in candidates[:ERA_CANDIDATES]:
            raw = client.get_bytes(candidate.thumb_url)
            score = images.portrait_score(raw)
            if score > 0 and (best is None or score > best[0]):
                best = (score, candidate, raw)
        if best is not None:
            journal.count("photos.era")
            return best[1], best[2]
    if primary is None:
        if not player.commons_file:
            journal.issue("no_photo", player.qid, "no image (P18) on Wikidata, silhouette shown")
        return None, None
    return primary, client.get_bytes(primary.thumb_url)


def _score(cur, journal: Journal) -> None:
    for qid in NOT_PLAYERS:
        db.exclude_player(cur, qid)
    cfg = scoring.load_config()
    inputs = [scoring.ScoreInput(qid, {k: float(v) for k, v in stats.items()}, views, sitelinks, hall_of_fame, start)
              for qid, views, stats, sitelinks, hall_of_fame, start in db.load_score_inputs(cur)]
    scores = scoring.score_catalogue(inputs, cfg)
    db.write_scores(cur, scores)
    for tier, n in scoring.tier_sizes(len(inputs), cfg).items():
        journal.info("tier %s: %d players", tier, n)


def cmd_score(args: argparse.Namespace) -> None:
    journal = Journal("score")
    with db.connect() as conn, conn.transaction(), conn.cursor() as cur:
        _score(cur, journal)
    journal.close()


def cmd_fetch_sackmann(args: argparse.Namespace) -> None:
    contact = os.environ.get("PIPELINE_CONTACT", "")
    if not contact:
        raise SystemExit("PIPELINE_CONTACT is required (email or URL)")
    with httpx.Client(
        headers={"User-Agent": f"DeuceDataPipeline/0.1 ({contact})"},
        timeout=120,
        follow_redirects=True,
    ) as client:
        n = sackmann.fetch_archive(Path(args.dest), client)
    print(f"sackmann archive: {n} files downloaded into {args.dest}")


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

    fetch = sub.add_parser("fetch-sackmann", help="download the Sackmann data archive")
    fetch.add_argument("--dest", default=str(DATA_DIR))
    fetch.set_defaults(func=cmd_fetch_sackmann)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
