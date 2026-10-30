"""Polite HTTP client: identifying User-Agent, retries, rate limit, disk cache.

Wikimedia APIs require a User-Agent with contact information:
https://meta.wikimedia.org/wiki/User-Agent_policy
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

DEFAULT_CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache" / "http"


class GaveUp(RuntimeError):
    """Still failing after every retry (network down, server overloaded)."""


class HttpClient:
    def __init__(
        self,
        cache_dir: Path | None = DEFAULT_CACHE_DIR,
        min_interval_s: float | None = None,
        max_retries: int = 5,
        timeout_s: float = 60.0,
    ) -> None:
        contact = os.environ.get("PIPELINE_CONTACT", "")
        if not contact:
            raise RuntimeError(
                "PIPELINE_CONTACT is required (email or URL), see pipeline/README.md"
            )
        self._client = httpx.Client(
            headers={"User-Agent": f"DeuceDataPipeline/0.1 ({contact})"},
            timeout=timeout_s,
            follow_redirects=True,
        )
        self._cache_dir = cache_dir
        # Polite default: at most one request per second per host, overridable
        # with PIPELINE_MIN_INTERVAL_S.
        self._min_interval_s = (
            min_interval_s
            if min_interval_s is not None
            else float(os.environ.get("PIPELINE_MIN_INTERVAL_S", "1.0"))
        )
        self._max_retries = max_retries
        self._last_call: dict[str, float] = {}

    def _throttle(self, url: str) -> None:
        host = urlparse(url).netloc
        wait = self._last_call.get(host, 0) + self._min_interval_s - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self._last_call[host] = time.monotonic()

    def _cache_path(self, key: str) -> Path | None:
        if self._cache_dir is None:
            return None
        digest = hashlib.sha256(key.encode()).hexdigest()
        return self._cache_dir / digest[:2] / digest

    def get_bytes(self, url: str, params: dict[str, Any] | None = None, use_cache: bool = True) -> bytes:
        key = url + "?" + json.dumps(params or {}, sort_keys=True)
        path = self._cache_path(key) if use_cache else None
        if path and path.exists():
            return path.read_bytes()

        for attempt in range(self._max_retries):
            self._throttle(url)
            try:
                response = self._client.get(url, params=params)
            except httpx.TransportError:
                # Connection reset or timeout: transient, retried like a 503.
                time.sleep(min(2**attempt, 60))
                continue
            if response.status_code in (429, 500, 502, 503, 504):
                retry_after = response.headers.get("retry-after")
                delay = float(retry_after) if retry_after and retry_after.isdigit() else 2**attempt
                time.sleep(min(delay, 60))
                continue
            response.raise_for_status()
            if path:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(response.content)
            return response.content
        raise GaveUp(f"giving up after {self._max_retries} attempts: {url}")

    def get_json(self, url: str, params: dict[str, Any] | None = None, use_cache: bool = True) -> Any:
        return json.loads(self.get_bytes(url, params, use_cache))
