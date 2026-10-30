"""Wikidata: candidate selection and structured facts (CC0)."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from urllib.parse import unquote

from .http import HttpClient

SPARQL_URL = "https://query.wikidata.org/sparql"
TENNIS_PLAYER = "Q10833314"  # occupation: tennis player
HALL_OF_FAME = "Q52454"  # award received: International Tennis Hall of Fame
MALE, FEMALE = "Q6581097", "Q6581072"
HANDS = {"Q3029952": "right", "Q789447": "left"}

# Candidates: occupation tennis player AND an article on fr or en Wikipedia.
_CANDIDATES_BODY = f"""
  ?p wdt:P106 wd:{TENNIS_PLAYER} ;
     wikibase:sitelinks ?links .
  FILTER EXISTS {{
    ?article schema:about ?p ;
             schema:isPartOf ?wiki .
    VALUES ?wiki {{ <https://fr.wikipedia.org/> <https://en.wikipedia.org/> }}
  }}
"""


def count_query(min_sitelinks: int = 0) -> str:
    return f"""SELECT (COUNT(DISTINCT ?p) AS ?n) WHERE {{{_CANDIDATES_BODY}
  FILTER(?links >= {int(min_sitelinks)})
}}"""


def top_candidates_query(limit: int, min_sitelinks: int = 0) -> str:
    """Most-linked candidates first (number of Wikipedia editions = notoriety proxy)."""
    return f"""SELECT ?p ?links WHERE {{{_CANDIDATES_BODY}
  FILTER(?links >= {int(min_sitelinks)})
}} ORDER BY DESC(?links) ?p LIMIT {int(limit)}"""


# Facts of a batch of players, one small query per group of properties: the
# query service fails (StackOverflowError) on a single query joining all
# these OPTIONAL clauses. Each group returns at most one row per player.
_DETAIL_GROUPS = [
    # "mul" (all languages) now often replaces identical en/fr labels.
    ("""(SAMPLE(?labelEn) AS ?label_en) (SAMPLE(?labelFr) AS ?label_fr) (SAMPLE(?labelMul) AS ?label_mul)""",
     """OPTIONAL {{ ?p rdfs:label ?labelEn . FILTER(LANG(?labelEn) = "en") }}
  OPTIONAL {{ ?p rdfs:label ?labelFr . FILTER(LANG(?labelFr) = "fr") }}
  OPTIONAL {{ ?p rdfs:label ?labelMul . FILTER(LANG(?labelMul) = "mul") }}"""),
    ("""(SAMPLE(?sex0) AS ?sex) (MIN(?birth0) AS ?birth) (SAMPLE(?hand0) AS ?hand)""",
     """OPTIONAL {{ ?p wdt:P21 ?sex0 }}
  OPTIONAL {{ ?p wdt:P569 ?birth0 }}
  OPTIONAL {{ ?p wdt:P741 ?hand0 }}"""),
    ("""(SAMPLE(?sportCode) AS ?sport_country) (SAMPLE(?citizenCode) AS ?citizen_country)""",
     """OPTIONAL {{ ?p wdt:P1532/wdt:P297 ?sportCode }}
  OPTIONAL {{ ?p wdt:P27/wdt:P297 ?citizenCode }}"""),
    ("""(MAX(?heightCm) AS ?height_cm)""",
     """OPTIONAL {{
    ?p p:P2048/psn:P2048 [ wikibase:quantityAmount ?heightM ] .
    BIND(?heightM * 100 AS ?heightCm)
  }}"""),
    ("""(SAMPLE(?image0) AS ?image) (MIN(?start) AS ?career_start) (MAX(?end) AS ?career_end)""",
     """OPTIONAL {{ ?p wdt:P18 ?image0 }}
  OPTIONAL {{ ?p wdt:P2031 ?start }}
  OPTIONAL {{ ?p wdt:P2032 ?end }}"""),
    ("""(SAMPLE(?frTitle) AS ?frwiki) (SAMPLE(?enTitle) AS ?enwiki)""",
     """OPTIONAL {{ ?fr schema:about ?p ; schema:isPartOf <https://fr.wikipedia.org/> ; schema:name ?frTitle }}
  OPTIONAL {{ ?en schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?enTitle }}"""),
    ("""(SAMPLE(?atpId) AS ?atp_id) (SAMPLE(?wtaId) AS ?wta_id) (SAMPLE(?category) AS ?commons_category)""",
     """OPTIONAL {{ ?p wdt:P536 ?atpId }}
  OPTIONAL {{ ?p wdt:P597 ?wtaId }}
  OPTIONAL {{ ?p wdt:P373 ?category }}"""),
    ("""(SAMPLE(?links0) AS ?sitelinks) (COUNT(?hof) AS ?hall_of_fame)""",
     f"""OPTIONAL {{{{ ?p wikibase:sitelinks ?links0 }}}}
  OPTIONAL {{{{ ?p wdt:P166 ?hof . FILTER(?hof = wd:{HALL_OF_FAME}) }}}}"""),
]


def details_queries(qids: list[str]) -> list[str]:
    values = " ".join(f"wd:{q}" for q in qids if re.fullmatch(r"Q\d+", q))
    return [
        f"""SELECT ?p {select}
WHERE {{
  VALUES ?p {{ {values} }}
  {body.format()}
}} GROUP BY ?p"""
        for select, body in _DETAIL_GROUPS
    ]


def merge_rows(groups: list[list[dict]]) -> list[dict]:
    """One row per player, merging the cells of every group (first query order)."""
    merged: dict[str, dict] = {}
    for rows in groups:
        for row in rows:
            merged.setdefault(row["p"]["value"], {}).update(row)
    return list(merged.values())


def fetch_details(client: HttpClient, qids: list[str]) -> list[dict]:
    return merge_rows([run_query(client, q) for q in details_queries(qids)])


@dataclass
class WikidataPlayer:
    qid: str
    name: str
    sex: str | None
    birth_date: date | None
    country_code: str | None
    hand: str | None
    height_cm: int | None
    commons_file: str | None
    career_start_year: int | None
    career_end_year: int | None
    frwiki_title: str | None
    enwiki_title: str | None
    atp_id: str | None
    wta_id: str | None
    commons_category: str | None = None
    # Wikipedia editions with an article on the player (lasting notoriety).
    sitelinks: int | None = None
    hall_of_fame: bool = False
    issues: list[str] = field(default_factory=list)


def run_query(client: HttpClient, query: str) -> list[dict]:
    data = client.get_json(SPARQL_URL, params={"query": query, "format": "json"})
    return data["results"]["bindings"]


def _value(row: dict, key: str) -> str | None:
    cell = row.get(key)
    return cell["value"] if cell else None


def _qid(uri: str | None) -> str | None:
    return uri.rsplit("/", 1)[-1] if uri else None


def _year(value: str | None) -> int | None:
    match = re.match(r"^[+-]?(\d{4})", value or "")
    return int(match.group(1)) if match else None


def _date(value: str | None) -> date | None:
    match = re.match(r"^\+?(\d{4})-(\d{2})-(\d{2})", value or "")
    if not match:
        return None
    try:
        return date(*map(int, match.groups()))
    except ValueError:  # Wikidata "00" day/month for imprecise dates
        return None


def parse_candidates(rows: list[dict]) -> list[tuple[str, int]]:
    return [(_qid(_value(r, "p")), int(_value(r, "links") or 0)) for r in rows]  # type: ignore[misc]


def parse_player(row: dict) -> WikidataPlayer:
    qid = _qid(_value(row, "p")) or ""
    issues: list[str] = []
    name = _value(row, "label_en") or _value(row, "label_fr") or _value(row, "label_mul") or ""
    if not name:
        issues.append("no English or French label")

    sex_qid = _qid(_value(row, "sex"))
    sex = {MALE: "male", FEMALE: "female"}.get(sex_qid or "")
    if sex is None:
        issues.append(f"unsupported or missing sex ({sex_qid})")

    country = _value(row, "sport_country") or _value(row, "citizen_country")
    if country and not re.fullmatch(r"[A-Z]{2}", country):
        country = None
    if country is None:
        issues.append("no ISO country code")

    height = _value(row, "height_cm")
    height_cm = round(float(height)) if height else None
    if height_cm is not None and not 120 <= height_cm <= 230:
        issues.append(f"implausible height {height_cm} cm ignored")
        height_cm = None

    image = _value(row, "image")
    commons_file = None
    if image:
        # http://commons.wikimedia.org/wiki/Special:FilePath/Name.jpg
        commons_file = "File:" + unquote(image.rsplit("/", 1)[-1])

    return WikidataPlayer(
        qid=qid,
        name=name,
        sex=sex,
        birth_date=_date(_value(row, "birth")),
        country_code=country,
        hand=HANDS.get(_qid(_value(row, "hand")) or ""),
        height_cm=height_cm,
        commons_file=commons_file,
        career_start_year=_year(_value(row, "career_start")),
        career_end_year=_year(_value(row, "career_end")),
        frwiki_title=_value(row, "frwiki"),
        enwiki_title=_value(row, "enwiki"),
        atp_id=_value(row, "atp_id"),
        wta_id=_value(row, "wta_id"),
        commons_category=_value(row, "commons_category"),
        sitelinks=int(_value(row, "sitelinks")) if _value(row, "sitelinks") else None,
        hall_of_fame=int(_value(row, "hall_of_fame") or 0) > 0,
        issues=issues,
    )


def slugify(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")
