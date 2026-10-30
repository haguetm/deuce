"""Wikimedia Commons: photo metadata, license filtering and attribution.

Only free licenses that allow reuse with attribution are accepted. NC and ND
licenses, fair use and unknown licenses are rejected and logged as issues.
"""
from __future__ import annotations

import html
import re
from dataclasses import dataclass

from .http import HttpClient
from .wikidata import slugify

API = "https://commons.wikimedia.org/w/api.php"
# Larger than the card: the photo is cropped around the face first.
THUMB_WIDTH = 1000
# Era photos: at most this many dated subcategories ("X in 2004") browsed.
MAX_SUBCATEGORIES = 6
_YEAR = re.compile(r"\b(18[5-9]\d|19\d\d|20\d\d)\b")
_PHOTO_MIME = ("image/jpeg", "image/png")
_BY_YEAR = re.compile(r"\bby year\b", re.I)
# Era photos smaller than this (pixels, both sides) would look blurry on a card.
MIN_ERA_SIDE = 500

_ALLOWED = [
    re.compile(r"^CC0( 1\.0)?$", re.I),
    re.compile(r"^Public domain$", re.I),
    re.compile(r"^PD(-\w+)*$", re.I),
    re.compile(r"^CC BY(-SA)? \d\.\d( [a-z\-]+)?$", re.I),
]
_FORBIDDEN = re.compile(r"\b(NC|ND)\b|fair use|non-?free", re.I)


@dataclass
class CommonsImage:
    commons_file: str
    thumb_url: str
    author: str
    license: str
    license_url: str
    source_url: str
    # Year the photo was taken (DateTimeOriginal), when Commons knows it.
    year: int | None = None


def license_allowed(short_name: str) -> bool:
    name = short_name.strip()
    if not name or _FORBIDDEN.search(name):
        return False
    return any(p.match(name) for p in _ALLOWED)


def strip_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def imageinfo_params(commons_file: str) -> dict:
    return {
        "action": "query",
        "titles": commons_file,
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "iiurlwidth": THUMB_WIDTH,
        "format": "json",
        "formatversion": "2",
    }


def year_of(value: str) -> int | None:
    match = _YEAR.search(value or "")
    return int(match.group(1)) if match else None


def parse_imageinfo(commons_file: str, data: dict) -> tuple[CommonsImage | None, str | None]:
    """Returns (image, None) or (None, reason it was rejected)."""
    pages = (data.get("query") or {}).get("pages") or []
    if not pages or "imageinfo" not in pages[0]:
        return None, "file not found on Commons"
    return parse_page(commons_file, pages[0])


def parse_page(commons_file: str, page: dict) -> tuple[CommonsImage | None, str | None]:
    info = page["imageinfo"][0]
    meta = info.get("extmetadata") or {}

    def field(name: str) -> str:
        return strip_html((meta.get(name) or {}).get("value", ""))

    license_name = field("LicenseShortName")
    if not license_allowed(license_name):
        return None, f"license not allowed: {license_name or 'unknown'}"

    is_public_domain = license_name.lower().startswith(("pd", "public domain", "cc0"))
    author = field("Artist") or field("Credit")
    if not author and not is_public_domain:
        return None, "no author for an attribution license"
    license_url = field("LicenseUrl") or (
        "https://creativecommons.org/publicdomain/mark/1.0/" if is_public_domain else ""
    )
    if not license_url:
        return None, "no license URL"

    thumb = info.get("thumburl") or info.get("url")
    if not thumb:
        return None, "no downloadable URL"

    return CommonsImage(
        commons_file=commons_file,
        thumb_url=thumb,
        author=author or "Unknown author (public domain)",
        license=license_name,
        license_url=license_url,
        source_url=info.get("descriptionurl") or f"https://commons.wikimedia.org/wiki/{commons_file}",
        # Date taken, else a year in the file name ("X at Wimbledon 2004.jpg").
        year=year_of(field("DateTimeOriginal")) or year_of(commons_file),
    ), None


def fetch_image(client: HttpClient, commons_file: str) -> tuple[CommonsImage | None, str | None]:
    return parse_imageinfo(commons_file, client.get_json(API, params=imageinfo_params(commons_file)))


def is_era_photo(year: int | None, career: tuple[int | None, int | None]) -> bool:
    start, end = career
    return year is not None and start is not None and end is not None and start <= year <= end


def rank_era_photos(images: list[CommonsImage], career: tuple[int, int], name: str) -> list[CommonsImage]:
    """Photos taken during the career: named after the player first (group
    shots and scans rarely are), then closest to the career peak (40 % in)."""
    start, end = career
    peak = start + 0.4 * (end - start)
    surname = slugify(name).rsplit("-", 1)[-1]
    dated = [i for i in images if is_era_photo(i.year, career)]
    return sorted(dated, key=lambda i: (
        surname not in slugify(i.commons_file), abs(i.year - peak), i.commons_file))  # type: ignore[operator]


def dated_subcategories(titles: list[str], career: tuple[int, int]) -> list[str]:
    """Subcategories whose title holds a career year, peak years first."""
    start, end = career
    peak = start + 0.4 * (end - start)
    dated = [(t, year_of(t)) for t in titles]
    inside = [(t, y) for t, y in dated if y is not None and start <= y <= end]
    return [t for t, _ in sorted(inside, key=lambda ty: (abs(ty[1] - peak), ty[0]))][:MAX_SUBCATEGORIES]


def _category_files(client: HttpClient, category: str) -> list[CommonsImage]:
    data = client.get_json(API, params={
        "action": "query",
        "generator": "categorymembers",
        "gcmtitle": category,
        "gcmtype": "file",
        "gcmlimit": "100",
        "prop": "imageinfo",
        "iiprop": "url|extmetadata|mime|size",
        "iiurlwidth": THUMB_WIDTH,
        "format": "json",
        "formatversion": "2",
    })
    result = []
    for page in (data.get("query") or {}).get("pages") or []:
        info = (page.get("imageinfo") or [{}])[0]
        if info.get("mime") not in _PHOTO_MIME:
            continue
        if min(info.get("width", 0), info.get("height", 0)) < MIN_ERA_SIDE:
            continue
        image, _ = parse_page(page["title"], page)
        if image is not None:
            result.append(image)
    return result


def _subcategories(client: HttpClient, category: str) -> list[str]:
    data = client.get_json(API, params={
        "action": "query",
        "list": "categorymembers",
        "cmtitle": category,
        "cmtype": "subcat",
        "cmlimit": "200",
        "format": "json",
        "formatversion": "2",
    })
    return [m["title"] for m in (data.get("query") or {}).get("categorymembers") or []]


def era_photos(client: HttpClient, category: str, career: tuple[int, int], name: str) -> list[CommonsImage]:
    """Freely licensed photos of the player's Commons category (and its dated
    subcategories) taken during the career, best candidates first."""
    title = category if category.startswith("Category:") else f"Category:{category}"
    found = {i.commons_file: i for i in _category_files(client, title)}
    subcategories = _subcategories(client, title)
    # "X by year" only groups "X in 2004", "X in 2005"...
    for group in [s for s in subcategories if _BY_YEAR.search(s)]:
        subcategories += _subcategories(client, group)
    for sub in dated_subcategories(subcategories, career):
        for image in _category_files(client, sub):
            found.setdefault(image.commons_file, image)
    return rank_era_photos(list(found.values()), career, name)


def category_photos(client: HttpClient, category: str, name: str) -> list[CommonsImage]:
    """Freely licensed photos of the player's Commons category, any date,
    named after the player first."""
    title = category if category.startswith("Category:") else f"Category:{category}"
    surname = slugify(name).rsplit("-", 1)[-1]
    return sorted(_category_files(client, title),
                  key=lambda i: (surname not in slugify(i.commons_file), i.commons_file))
