from datetime import date

from deuce_pipeline import wikidata

# Fictional player: test data only, not a real person.
ROW = {
    "p": {"value": "http://www.wikidata.org/entity/Q999999990"},
    "label_en": {"value": "Zoé Testeuse"},
    "sex": {"value": "http://www.wikidata.org/entity/Q6581072"},
    "birth": {"value": "1990-04-00T00:00:00Z"},
    "citizen_country": {"value": "FR"},
    "hand": {"value": "http://www.wikidata.org/entity/Q789447"},
    "height_cm": {"value": "178.0"},
    "image": {"value": "http://commons.wikimedia.org/wiki/Special:FilePath/Zo%C3%A9%20Test%202019.jpg"},
    "career_start": {"value": "2008-01-01T00:00:00Z"},
    "frwiki": {"value": "Zoé Testeuse"},
}


def test_parse_player_maps_fields():
    p = wikidata.parse_player(ROW)
    assert p.qid == "Q999999990"
    assert p.name == "Zoé Testeuse"
    assert p.sex == "female"
    assert p.birth_date is None  # imprecise date ("00" day) is not invented
    assert p.country_code == "FR"  # citizenship used when no sporting country
    assert p.hand == "left"
    assert p.height_cm == 178
    assert p.commons_file == "File:Zoé Test 2019.jpg"
    assert p.career_start_year == 2008
    assert p.enwiki_title is None


def test_parse_player_reports_issues_instead_of_guessing():
    row = {"p": {"value": "http://www.wikidata.org/entity/Q999999991"}, "height_cm": {"value": "1.85"}}
    p = wikidata.parse_player(row)
    assert p.sex is None and p.country_code is None and p.height_cm is None
    assert any("label" in i for i in p.issues)
    assert any("height" in i for i in p.issues)


def test_full_date_is_parsed():
    p = wikidata.parse_player({**ROW, "birth": {"value": "1990-04-12T00:00:00Z"}})
    assert p.birth_date == date(1990, 4, 12)


def test_slugify():
    assert wikidata.slugify("Zoé Testeuse-Écrin") == "zoe-testeuse-ecrin"
    assert wikidata.slugify("  O'Neil  ") == "o-neil"


def test_details_queries_reject_invalid_ids():
    for query in wikidata.details_queries(["Q1", "Q2", "DROP TABLE", "Q3}"]):
        assert "wd:Q1 wd:Q2" in query
        assert "DROP" not in query and "Q3}" not in query
        assert query.count("OPTIONAL") <= 3  # small queries only


def test_detail_groups_merge_into_one_row_per_player():
    p1 = {"p": {"value": "http://www.wikidata.org/entity/Q1"}}
    p2 = {"p": {"value": "http://www.wikidata.org/entity/Q2"}}
    rows = wikidata.merge_rows([
        [{**p1, "label_en": {"value": "One"}}, {**p2, "label_en": {"value": "Two"}}],
        [{**p1, "sex": {"value": "http://www.wikidata.org/entity/Q6581097"}}],
    ])
    assert len(rows) == 2
    player = wikidata.parse_player(rows[0])
    assert (player.qid, player.name, player.sex) == ("Q1", "One", "male")


def test_count_query_filters_on_fr_or_en_article():
    q = wikidata.count_query(10)
    assert "fr.wikipedia.org" in q and "en.wikipedia.org" in q and ">= 10" in q
