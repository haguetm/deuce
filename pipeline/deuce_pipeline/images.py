"""Image processing: resize to card width and re-encode as WebP (EXIF dropped)."""
from __future__ import annotations

import io

from PIL import Image, ImageOps

CARD_WIDTH = 400


def to_card_webp(raw: bytes, width: int = CARD_WIDTH, quality: int = 82) -> tuple[bytes, int, int]:
    with Image.open(io.BytesIO(raw)) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")
        if img.width > width:
            img = img.resize((width, round(img.height * width / img.width)), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="WEBP", quality=quality, method=6)  # no exif/icc passed: metadata stripped
        return out.getvalue(), img.width, img.height
