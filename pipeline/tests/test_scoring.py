from deuce_pipeline import scoring
from deuce_pipeline.cli import propose_threshold

CFG = scoring.load_config()


def test_percentiles_ties_share_value():
    assert scoring.percentiles([1, 1, 3]) == [1 / 3, 1 / 3, 5 / 6]


def test_tier_sizes_follow_config():
    sizes = scoring.tier_sizes(4000, CFG)
    assert sizes == {"mythic": 40, "legendary": 200, "epic": 400, "rare": 800, "uncommon": 1000, "common": 1560}
    assert sum(scoring.tier_sizes(200, CFG).values()) == 200
    assert scoring.tier_sizes(200, CFG)["mythic"] == round(200 * CFG["tiers_by_percentile"]["mythic"] / 100)
    assert scoring.tier_sizes(20, CFG)["mythic"] == 1  # every tier keeps a card in a tiny catalogue


def test_best_rank_buckets():
    table = CFG["achievements"]["best_rank_points"]
    assert scoring._best_rank_points(1, table) == table["1"]
    assert scoring._best_rank_points(7, table) == table["4-10"]
    assert scoring._best_rank_points(500, table) == 0
    assert scoring._best_rank_points(None, table) == 0


def test_champion_ranks_above_unknown_player_and_is_deterministic():
    players = [scoring.ScoreInput(f"Q{i}", {"best_rank": 150}, 1000) for i in range(1, 200)]
    players.append(scoring.ScoreInput("Q9999", {"grand_slam_titles": 10, "weeks_at_no1": 100, "best_rank": 1}, 5_000_000))
    first = scoring.score_catalogue(players, CFG)
    assert first["Q9999"][1] == "mythic"
    assert first == scoring.score_catalogue(list(reversed(players)), CFG)
    assert all(0 <= s <= 100 for s, _ in first.values())


def test_hall_of_fame_counts_as_achievement():
    a = CFG["achievements"]
    ranked = {"best_rank": 150}
    assert scoring.achievements_raw(ranked, CFG, hall_of_fame=True) == a["hall_of_fame"] + a["best_rank_points"]["101-200"]
    # Retired before computer rankings: the statistics miss the career.
    assert scoring.achievements_raw({}, CFG, hall_of_fame=True) == a["hall_of_fame_before_rankings"]
    # Started before the Open era: titles before 1968 are missing too.
    assert scoring.achievements_raw(ranked, CFG, True, career_start=1958) == (
        a["hall_of_fame_before_rankings"] + a["best_rank_points"]["101-200"])
    assert scoring.achievements_raw({}, CFG) == 0


def test_lasting_fame_lifts_a_pre_open_era_legend():
    # Same (empty) stats and views: Wikipedia editions and the Hall of Fame decide.
    players = [scoring.ScoreInput(f"Q{i}", {}, 10_000, sitelinks=10) for i in range(1, 100)]
    players.append(scoring.ScoreInput("Q9999", {}, 10_000, sitelinks=60, hall_of_fame=True))
    result = scoring.score_catalogue(players, CFG)
    assert max(result, key=lambda q: result[q][0]) == "Q9999"


def test_propose_threshold():
    counts = {5: 15000, 10: 7000, 15: 4500, 20: 2500, 30: 900}
    assert propose_threshold(counts) == 15
    assert propose_threshold({5: 100}) is None
