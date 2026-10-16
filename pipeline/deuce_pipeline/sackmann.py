"""Career statistics from Jeff Sackmann's datasets (CC BY-NC-SA 4.0).

Expects local clones (never committed):
  pipeline/data/tennis_atp/   https://github.com/JeffSackmann/tennis_atp
  pipeline/data/tennis_wta/   https://github.com/JeffSackmann/tennis_wta

Only main-draw tour files (atp_matches_YYYY.csv / wta_matches_YYYY.csv) are
read; qualifying, challenger, ITF and amateur files are ignored.
"""
from __future__ import annotations

import csv
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

SOURCE_ID = {"atp": "sackmann_atp", "wta": "sackmann_wta"}
SOURCE_URL = {
    "atp": "https://github.com/JeffSackmann/tennis_atp",
    "wta": "https://github.com/JeffSackmann/tennis_wta",
}

# tourney_level codes that award a tour title (provisional, see docs/DATA.md).
TITLE_LEVELS = {
    "atp": {"G", "M", "A", "F"},
    "wta": {"G", "P", "PM", "I", "T1", "T2", "T3", "T4", "T5", "F"},
}
GRAND_SLAM = "G"
SURFACE_MIN_WINS = 20


@dataclass
class PlayerStats:
    sackmann_id: str
    tour: str
    best_rank: int | None = None
    weeks_at_no1: int = 0
    titles: int = 0
    grand_slam_titles: int = 0
    grand_slam_finals: int = 0
    match_wins: int = 0
    match_losses: int = 0
    first_year: int | None = None
    last_year: int | None = None
    wins_by_surface: Counter = field(default_factory=Counter)

    @property
    def preferred_surface(self) -> str | None:
        if not self.wins_by_surface:
            return None
        surface, wins = self.wins_by_surface.most_common(1)[0]
        return surface.lower() if wins >= SURFACE_MIN_WINS else None

    def as_stat_rows(self) -> dict[str, int]:
        """Stats stored in player_stats (numeric only, None skipped)."""
        rows = {
            "best_rank": self.best_rank,
            "weeks_at_no1": self.weeks_at_no1,
            "titles": self.titles,
            "grand_slam_titles": self.grand_slam_titles,
            "grand_slam_finals": self.grand_slam_finals,
            "match_wins": self.match_wins,
            "match_losses": self.match_losses,
        }
        return {k: v for k, v in rows.items() if v is not None}


def read_players(tour_dir: Path, tour: str) -> dict[str, str]:
    """Maps Wikidata QID -> Sackmann player_id, using the wikidata_id column."""
    mapping: dict[str, str] = {}
    with open(tour_dir / f"{tour}_players.csv", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            qid = (row.get("wikidata_id") or "").strip()
            if re.fullmatch(r"Q\d+", qid):
                mapping[qid] = row["player_id"]
    return mapping


def compute_stats(tour_dir: Path, tour: str, player_ids: set[str]) -> dict[str, PlayerStats]:
    stats: dict[str, PlayerStats] = {pid: PlayerStats(pid, tour) for pid in player_ids}
    _read_rankings(tour_dir, tour, stats)
    _read_matches(tour_dir, tour, stats)
    return stats


def _read_rankings(tour_dir: Path, tour: str, stats: dict[str, PlayerStats]) -> None:
    no1_dates: dict[str, set[str]] = defaultdict(set)
    for path in sorted(tour_dir.glob(f"{tour}_rankings_*.csv")):
        with open(path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                pid = row.get("player")
                if pid not in stats or not (row.get("rank") or "").isdigit():
                    continue
                rank = int(row["rank"])
                s = stats[pid]
                s.best_rank = rank if s.best_rank is None else min(s.best_rank, rank)
                if rank == 1:
                    no1_dates[pid].add(row["ranking_date"])
    for pid, dates in no1_dates.items():
        # One ranking file row per week = one week at No. 1 (approximation for
        # periods where rankings were not weekly, see docs/DATA.md).
        stats[pid].weeks_at_no1 = len(dates)


def _read_matches(tour_dir: Path, tour: str, stats: dict[str, PlayerStats]) -> None:
    pattern = re.compile(rf"^{tour}_matches_(\d{{4}})\.csv$")
    titles = TITLE_LEVELS[tour]
    for path in sorted(tour_dir.iterdir()):
        match = pattern.match(path.name)
        if not match:
            continue
        year = int(match.group(1))
        with open(path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                winner, loser = row.get("winner_id"), row.get("loser_id")
                level, rnd = row.get("tourney_level"), row.get("round")
                for pid, won in ((winner, True), (loser, False)):
                    if pid not in stats:
                        continue
                    s = stats[pid]
                    s.first_year = year if s.first_year is None else min(s.first_year, year)
                    s.last_year = year if s.last_year is None else max(s.last_year, year)
                    if won:
                        s.match_wins += 1
                        if row.get("surface"):
                            s.wins_by_surface[row["surface"]] += 1
                    else:
                        s.match_losses += 1
                    if rnd == "F" and level in titles and won:
                        s.titles += 1
                    if rnd == "F" and level == GRAND_SLAM:
                        s.grand_slam_finals += 1
                        if won:
                            s.grand_slam_titles += 1
