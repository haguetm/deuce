"""Wikimedia Pageviews API: monthly user views over the last N months."""
from __future__ import annotations

import calendar
from datetime import date
from urllib.parse import quote

import httpx

from .http import HttpClient

API = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article"


def window(today: date, months: int) -> tuple[str, str]:
    """Last `months` complete months, as YYYYMMDD bounds for the API."""
    end_year, end_month = (today.year, today.month - 1) if today.month > 1 else (today.year - 1, 12)
    start_index = end_year * 12 + (end_month - 1) - (months - 1)
    start_year, start_month = divmod(start_index, 12)
    last_day = calendar.monthrange(end_year, end_month)[1]
    return f"{start_year}{start_month + 1:02d}01", f"{end_year}{end_month:02d}{last_day}"


def parse_total(data: dict) -> int:
    return sum(int(item.get("views", 0)) for item in data.get("items", []))


def fetch_views(client: HttpClient, project: str, title: str, start: str, end: str) -> int:
    url = f"{API}/{project}/all-access/user/{quote(title.replace(' ', '_'), safe='')}/monthly/{start}/{end}"
    try:
        return parse_total(client.get_json(url))
    except httpx.HTTPStatusError as err:
        if err.response.status_code == 404:  # no data for this article
            return 0
        raise
