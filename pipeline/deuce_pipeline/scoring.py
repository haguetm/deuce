"""Rarity score and tiers. Pure functions, parameters from config/rarity.json.

score = w_achievements * percentile(achievements) + w_notoriety * notoriety
notoriety = w_pageviews * percentile(pageviews) + w_sitelinks * percentile(sitelinks)
Achievements add a Hall of Fame bonus, the only record of most titles won
before 1968. Pageviews measure today's fame, the number of Wikipedia editions
a lasting one. Tiers are then assigned by percentile of the score inside the
catalogue, so the catalogue split holds whatever its size.
"""
from __future__ import annotations

import json
import math
from bisect import bisect_left, bisect_right
from dataclasses import dataclass
from pathlib import Path

CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "rarity.json"
TIER_ORDER = ["mythic", "legendary", "epic", "rare", "uncommon"]  # rest = common


@dataclass
class ScoreInput:
    qid: str
    stats: dict[str, float]
    pageviews: int
    sitelinks: int = 0
    hall_of_fame: bool = False
    career_start: int | None = None


def load_config(path: Path = CONFIG_PATH) -> dict:
    return json.loads(path.read_text())


def _best_rank_points(best_rank: float | None, table: dict[str, float]) -> float:
    if not best_rank:
        return 0.0
    for bucket, points in table.items():
        low, _, high = bucket.partition("-")
        if int(low) <= best_rank <= int(high or low):
            return float(points)
    return 0.0


def achievements_raw(stats: dict[str, float], cfg: dict, hall_of_fame: bool = False,
                     career_start: int | None = None) -> float:
    a = cfg["achievements"]
    return (
        a["grand_slam_titles"] * stats.get("grand_slam_titles", 0)
        + a["grand_slam_finals"] * stats.get("grand_slam_finals", 0)
        + a["weeks_at_no1"] * stats.get("weeks_at_no1", 0)
        + a["titles"] * stats.get("titles", 0)
        + _best_rank_points(stats.get("best_rank"), a["best_rank_points"])
        + _hall_of_fame_points(stats, a, hall_of_fame, career_start)
    )


OPEN_ERA = 1968


def _hall_of_fame_points(stats: dict[str, float], a: dict, hall_of_fame: bool,
                         career_start: int | None) -> float:
    """Hall of Famers who started before the Open era (1968) or never had a
    computer ranking: the statistics miss most of their titles, the Hall of
    Fame stands for them."""
    if not hall_of_fame:
        return 0.0
    before = not stats.get("best_rank") or (career_start is not None and career_start < OPEN_ERA)
    return float(a["hall_of_fame_before_rankings"] if before else a["hall_of_fame"])


def notoriety_raw(pageviews: int) -> float:
    return math.log10(max(pageviews, 0) + 1)


def percentiles(values: list[float]) -> list[float]:
    """Mid-rank percentile in [0, 1]; ties share the same value."""
    n = len(values)
    if n == 0:
        return []
    order = sorted(values)
    result = []
    for v in values:
        below = bisect_left(order, v)
        equal = bisect_right(order, v) - below
        result.append((below + 0.5 * equal) / n)
    return result


def tier_sizes(n: int, cfg: dict) -> dict[str, int]:
    """Number of players per tier. Each non-common tier gets at least one card
    when the catalogue has room, so small test catalogues stay playable."""
    sizes: dict[str, int] = {}
    remaining = n
    for tier in TIER_ORDER:
        size = round(n * cfg["tiers_by_percentile"][tier] / 100)
        size = min(max(size, 1 if n > len(TIER_ORDER) else 0), remaining)
        sizes[tier] = size
        remaining -= size
    sizes["common"] = remaining
    return sizes


def score_catalogue(players: list[ScoreInput], cfg: dict) -> dict[str, tuple[float, str]]:
    """Returns qid -> (rarity_score in [0, 100], tier)."""
    if not players:
        return {}
    w = cfg["weights"]
    n = cfg["notoriety"]
    ach = percentiles([achievements_raw(p.stats, cfg, p.hall_of_fame, p.career_start) for p in players])
    views = percentiles([notoriety_raw(p.pageviews) for p in players])
    links = percentiles([float(p.sitelinks) for p in players])
    nor = [n["pageviews_weight"] * v + n["sitelinks_weight"] * s for v, s in zip(views, links)]
    scores = {
        p.qid: round(100 * (w["achievements"] * a + w["notoriety"] * b), 4)
        for p, a, b in zip(players, ach, nor)
    }
    # Highest score first; QID as deterministic tie-break.
    ranked = sorted(scores, key=lambda q: (-scores[q], int(q[1:])))
    sizes = tier_sizes(len(ranked), cfg)
    result: dict[str, tuple[float, str]] = {}
    index = 0
    for tier in [*TIER_ORDER, "common"]:
        for qid in ranked[index : index + sizes[tier]]:
            result[qid] = (scores[qid], tier)
        index += sizes[tier]
    return result
