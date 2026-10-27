from pathlib import Path

from deuce_pipeline import sackmann

# Fictional ids and players: test data only.
PLAYERS = "player_id,name_first,name_last,hand,dob,ioc,height,wikidata_id\n1001,Ana,Alpha,R,19900101,FRA,175,Q999999990\n1002,Bea,Beta,L,19910101,ESP,170,\n1003,Cid,Gamma,R,19920101,ITA,180,Q999999992\n"
RANKINGS = "ranking_date,rank,player,points\n20200106,1,1001,9000\n20200113,1,1001,9000\n20200120,2,1001,8000\n20200106,3,1003,5000\n"
MATCHES_2020 = (
    "tourney_id,tourney_name,surface,tourney_level,round,winner_id,loser_id\n"
    "2020-1,Slam A,Clay,G,F,1001,1003\n"
    "2020-1,Slam A,Clay,G,SF,1003,1002\n"
    "2020-2,Tour B,Hard,A,F,1003,1001\n"
    "2020-3,Cup,Hard,D,F,1001,1003\n"
)
MATCHES_2021 = "tourney_id,tourney_name,surface,tourney_level,round,winner_id,loser_id\n2021-1,Slam C,Grass,G,F,1003,1001\n"


def _write(tmp_path: Path) -> Path:
    d = tmp_path / "tennis_atp"
    d.mkdir()
    (d / "atp_players.csv").write_text(PLAYERS)
    (d / "atp_rankings_20s.csv").write_text(RANKINGS)
    (d / "atp_matches_2020.csv").write_text(MATCHES_2020)
    (d / "atp_matches_2021.csv").write_text(MATCHES_2021)
    # Ignored files: must not count
    (d / "atp_matches_qual_chall_2020.csv").write_text(
        "tourney_id,tourney_name,surface,tourney_level,round,winner_id,loser_id\nq,Q,Hard,C,F,1001,1003\n"
    )
    return d


def test_players_mapping_uses_wikidata_column(tmp_path):
    mapping = sackmann.read_players(_write(tmp_path), "atp")
    assert mapping == {"Q999999990": "1001", "Q999999992": "1003"}


def test_career_stats(tmp_path):
    d = _write(tmp_path)
    stats = sackmann.compute_stats(d, "atp", {"1001", "1003"})
    a, c = stats["1001"], stats["1003"]

    assert a.best_rank == 1 and a.weeks_at_no1 == 2
    assert c.best_rank == 3 and c.weeks_at_no1 == 0
    # Davis Cup final (level D) and challenger file are not titles
    assert a.titles == 1 and a.grand_slam_titles == 1 and a.grand_slam_finals == 2
    assert c.titles == 2 and c.grand_slam_titles == 1 and c.grand_slam_finals == 2
    assert (a.match_wins, a.match_losses) == (2, 2)
    assert (a.first_year, a.last_year) == (2020, 2021)


def test_preferred_surface_needs_enough_wins(tmp_path):
    stats = sackmann.compute_stats(_write(tmp_path), "atp", {"1001"})
    assert stats["1001"].preferred_surface is None
    stats["1001"].wins_by_surface["Clay"] = 25
    assert stats["1001"].preferred_surface == "clay"


def test_titles_by_major():
    assert sackmann.major_of("Roland Garros") == "roland_garros"
    assert sackmann.major_of(" Wimbledon ") == "wimbledon"
    assert sackmann.major_of("Australian Chps.") == "australian_open"
    assert sackmann.major_of("Slam A") is None


def test_major_titles_are_stat_rows(tmp_path):
    d = _write(tmp_path)
    stats = sackmann.compute_stats(d, "atp", {"1001", "1003"})
    rows = stats["1001"].as_stat_rows()
    # "Slam A" is not a known major: counted as a Grand Slam, not per event
    assert rows["grand_slam_titles"] == 1
    assert rows["roland_garros_titles"] == 0


def test_archive_listing_keeps_tour_files_only():
    listing = {"siblings": [
        {"rfilename": "atp/atp_players.csv"},
        {"rfilename": "wta/wta_matches_2026.csv"},
        {"rfilename": "atp/UPSTREAM_README.md"},
        {"rfilename": "slam_pointbypoint/2024-wimbledon-points.csv"},
        {"rfilename": "LICENSE"},
    ]}
    assert sackmann.archive_files(listing) == [
        ("atp", "atp/atp_players.csv"),
        ("wta", "wta/wta_matches_2026.csv"),
        ("atp", "atp/UPSTREAM_README.md"),
    ]
