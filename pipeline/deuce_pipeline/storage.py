"""Image storage backends, selected by IMAGE_STORAGE_PROVIDER.

- r2:       Cloudflare R2 (production default, free egress)
- supabase: Supabase Storage (fallback)
- local:    files under public/card-images/ for local development only

The database stores only the object key (`storage_path`); the app builds the
public URL from NEXT_PUBLIC_IMAGE_BASE_URL, so switching backend does not
touch the data.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Protocol

import httpx

REPO_ROOT = Path(__file__).resolve().parents[2]


class Storage(Protocol):
    def put(self, key: str, body: bytes, content_type: str) -> None: ...


def object_key(qid: str, body: bytes) -> str:
    """Content-addressed key: a new photo gets a new URL (no stale CDN cache)."""
    return f"players/{qid}/{hashlib.sha256(body).hexdigest()[:16]}.webp"


class LocalStorage:
    def __init__(self, root: Path = REPO_ROOT / "public" / "card-images") -> None:
        self.root = root

    def put(self, key: str, body: bytes, content_type: str) -> None:
        path = self.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)


class R2Storage:
    def __init__(self) -> None:
        import boto3

        self.bucket = os.environ["R2_BUCKET"]
        self.client = boto3.client(
            "s3",
            endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
            region_name="auto",
        )

    def put(self, key: str, body: bytes, content_type: str) -> None:
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=body,
            ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable",
        )


class SupabaseStorage:
    def __init__(self) -> None:
        self.base = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
        self.bucket = os.environ.get("SUPABASE_IMAGE_BUCKET", "card-images")
        self.key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    def put(self, key: str, body: bytes, content_type: str) -> None:
        response = httpx.post(
            f"{self.base}/storage/v1/object/{self.bucket}/{key}",
            content=body,
            headers={
                "Authorization": f"Bearer {self.key}",
                "Content-Type": content_type,
                "Cache-Control": "max-age=31536000",
                "x-upsert": "true",
            },
            timeout=60,
        )
        response.raise_for_status()


def get_storage() -> Storage:
    provider = os.environ.get("IMAGE_STORAGE_PROVIDER", "local")
    if provider == "r2":
        return R2Storage()
    if provider == "supabase":
        return SupabaseStorage()
    if provider == "local":
        return LocalStorage()
    raise ValueError(f"unknown IMAGE_STORAGE_PROVIDER: {provider}")
