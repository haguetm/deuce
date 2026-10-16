"""Wikimedia Commons: photo metadata, license filtering and attribution.

Only free licenses that allow reuse with attribution are accepted. NC and ND
licenses, fair use and unknown licenses are rejected and logged as issues.
"""
from __future__ import annotations

import html
import re
from dataclasses import dataclass

from .http import HttpClient

API = "https://commons.wikimedia.org/w/api.php"
THUMB_WIDTH = 400

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


def parse_imageinfo(commons_file: str, data: dict) -> tuple[CommonsImage | None, str | None]:
    """Returns (image, None) or (None, reason it was rejected)."""
    pages = (data.get("query") or {}).get("pages") or []
    if not pages or "imageinfo" not in pages[0]:
        return None, "file not found on Commons"
    info = pages[0]["imageinfo"][0]
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
    ), None


def fetch_image(client: HttpClient, commons_file: str) -> tuple[CommonsImage | None, str | None]:
    return parse_imageinfo(commons_file, client.get_json(API, params=imageinfo_params(commons_file)))
