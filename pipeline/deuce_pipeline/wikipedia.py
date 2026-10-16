"""Wikipedia summaries (CC BY-SA 4.0): short bio extract per language."""
from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import quote

from .http import HttpClient

LICENSE = "CC BY-SA 4.0"


@dataclass
class WikipediaText:
    lang: str
    extract: str
    article_url: str
    revision_id: int | None


def summary_url(lang: str, title: str) -> str:
    return f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{quote(title.replace(' ', '_'), safe='')}"


def parse_summary(lang: str, data: dict) -> WikipediaText | None:
    extract = (data.get("extract") or "").strip()
    if not extract or data.get("type") == "disambiguation":
        return None
    page = (data.get("content_urls") or {}).get("desktop", {}).get("page")
    if not page:
        return None
    revision = data.get("revision")
    return WikipediaText(
        lang=lang,
        extract=extract,
        article_url=page,
        revision_id=int(revision) if revision and str(revision).isdigit() else None,
    )


def fetch_summary(client: HttpClient, lang: str, title: str) -> WikipediaText | None:
    return parse_summary(lang, client.get_json(summary_url(lang, title)))
