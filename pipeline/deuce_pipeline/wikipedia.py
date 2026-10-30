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


WIKIDATA_API = "https://www.wikidata.org/w/api.php"
# Lead images looked up on at most this many Wikipedias per player.
MAX_WIKIS = 15


def parse_sitelinks(entity: dict) -> dict[str, str]:
    """Wikipedia language code -> article title, English and French first."""
    links = {}
    for site, link in (entity.get("sitelinks") or {}).items():
        # "enwiki", "zh_min_nanwiki"; not "commonswiki", "enwikiquote"...
        if not site.endswith("wiki") or site in ("commonswiki", "specieswiki", "metawiki",
                                                 "wikidatawiki", "sourceswiki", "mediawikiwiki"):
            continue
        links[site[:-4].replace("_", "-")] = link["title"]
    return dict(sorted(links.items(), key=lambda kv: (kv[0] not in ("en", "fr"), kv[0] != "en", kv[0])))


def fetch_sitelinks(client: HttpClient, qid: str) -> dict[str, str]:
    data = client.get_json(WIKIDATA_API, {"action": "wbgetentities", "ids": qid, "props": "sitelinks", "format": "json"})
    return parse_sitelinks((data.get("entities") or {}).get(qid) or {})


def fetch_commons_category(client: HttpClient, qid: str) -> str | None:
    """Commons category (P373) of a Wikidata item."""
    data = client.get_json(WIKIDATA_API, {"action": "wbgetentities", "ids": qid, "props": "claims", "format": "json"})
    claims = (((data.get("entities") or {}).get(qid) or {}).get("claims") or {}).get("P373") or []
    for claim in claims:
        value = claim.get("mainsnak", {}).get("datavalue", {}).get("value")
        if value:
            return value
    return None


def parse_lead_image(data: dict) -> str | None:
    """Commons file name of an article's lead image (free licences only)."""
    for page in ((data.get("query") or {}).get("pages") or {}).values():
        if page.get("pageimage"):
            return "File:" + page["pageimage"].replace("_", " ")
    return None


def lead_images(client: HttpClient, links: dict[str, str]) -> list[str]:
    """Free lead images of the player's Wikipedia articles, in language order,
    without duplicates. Some Wikipedias show a photo Wikidata does not have."""
    files: list[str] = []
    for lang, title in list(links.items())[:MAX_WIKIS]:
        data = client.get_json(f"https://{lang}.wikipedia.org/w/api.php", {
            "action": "query", "prop": "pageimages", "piprop": "name",
            "pilicense": "free", "titles": title, "format": "json"})
        name = parse_lead_image(data)
        if name and name not in files:
            files.append(name)
    return files
