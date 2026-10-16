from datetime import date

from deuce_pipeline import pageviews, wikipedia


def test_parse_summary():
    data = {
        "type": "standard",
        "extract": "Zoé Testeuse est une joueuse fictive.",
        "revision": "123456",
        "content_urls": {"desktop": {"page": "https://fr.wikipedia.org/wiki/Zo%C3%A9_Testeuse"}},
    }
    text = wikipedia.parse_summary("fr", data)
    assert text.extract.startswith("Zoé") and text.revision_id == 123456
    assert text.article_url.startswith("https://fr.wikipedia.org/")


def test_disambiguation_and_empty_pages_are_skipped():
    assert wikipedia.parse_summary("en", {"type": "disambiguation", "extract": "x"}) is None
    assert wikipedia.parse_summary("en", {"type": "standard", "extract": ""}) is None


def test_summary_url_encodes_title():
    assert wikipedia.summary_url("fr", "Zoé Testeuse") == "https://fr.wikipedia.org/api/rest_v1/page/summary/Zo%C3%A9_Testeuse"


def test_pageviews_window_is_last_complete_months():
    assert pageviews.window(date(2026, 10, 16), 12) == ("20251001", "20260930")
    assert pageviews.window(date(2027, 1, 5), 12) == ("20260101", "20261231")


def test_pageviews_total():
    assert pageviews.parse_total({"items": [{"views": 10}, {"views": 5}]}) == 15
    assert pageviews.parse_total({}) == 0
