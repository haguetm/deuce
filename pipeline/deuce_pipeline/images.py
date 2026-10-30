"""Image processing: crop to the card photo frame around the face, resize to
card width and re-encode as WebP (EXIF dropped).

Faces are found with YuNet, the small face detection network of OpenCV
(models/face_detection_yunet_2023mar.onnx, MIT, from opencv/opencv_zoo).
Without a face, the crop keeps the top of the picture, where the head
usually is.
"""
from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter, ImageOps

CARD_WIDTH = 400
# Width / height of the photo area of a card (5:7 card minus the caption).
CARD_ASPECT = 0.85
# Where the face center sits in the crop, from the top.
FACE_Y = 0.36
# The face takes at least this share of the crop height (tighter on wide shots)...
MIN_FACE_SHARE = 0.2
# ...and at most this share when the crop tightens to center it (close-ups).
MAX_FACE_SHARE = 0.45
FACE_MODEL = Path(__file__).resolve().parent.parent / "models" / "face_detection_yunet_2023mar.onnx"
FACE_SCORE = 0.8
# Faces smaller than this share of the picture's short side are crowd or background.
MIN_FACE_SIDE = 0.03
# Longest side of the copy faces are looked for in first (see find_faces).
DETECT_SIDE = 640

_detector = None


@dataclass(frozen=True)
class Box:
    x: int
    y: int
    w: int
    h: int


def find_face(img: Image.Image) -> Box | None:
    """Largest confident face (the subject, not the crowd), or None."""
    faces = find_faces(img)
    return faces[0] if faces else None


def find_faces(img: Image.Image) -> list[Box]:
    """Confident sizeable faces, largest first. YuNet misses faces much
    larger than its 320 px design size (close portraits in a big picture):
    it looks at a copy reduced to DETECT_SIDE first, then at full size."""
    scale = min(1.0, DETECT_SIDE / max(img.size))
    if scale < 1:
        small = img.resize((round(img.width * scale), round(img.height * scale)), Image.Resampling.BILINEAR)
        found = [Box(round(b.x / scale), round(b.y / scale), round(b.w / scale), round(b.h / scale))
                 for b in _detect(small)]
        if found:
            return found
    return _detect(img)


def _detect(img: Image.Image) -> list[Box]:
    global _detector
    if _detector is None:
        _detector = cv2.FaceDetectorYN.create(str(FACE_MODEL), "", (320, 320), FACE_SCORE, 0.3, 50)
    bgr = np.ascontiguousarray(np.asarray(img.convert("RGB"))[:, :, ::-1])
    height, width = bgr.shape[:2]
    _detector.setInputSize((width, height))
    _, faces = _detector.detect(bgr)
    if faces is None:
        return []
    min_side = MIN_FACE_SIDE * min(width, height)
    found = [Box(int(f[0]), int(f[1]), int(f[2]), int(f[3]))
             for f in faces if min(f[2], f[3]) >= min_side]
    return sorted(found, key=lambda b: -b.w * b.h)


def ideal_crop_height(width: int, height: int, face: Box | None, aspect: float = CARD_ASPECT) -> float:
    """Crop height that frames the face best, whatever the resolution:
    zoomed in on a wide shot, and tight enough for the face to sit centered
    (x) and at FACE_Y (y) even near the edge of the picture."""
    full = min(height, width / aspect)
    if face is None:
        return full
    cx, cy = face.x + face.w / 2, face.y + face.h / 2
    crop_h = min(full, face.h / MIN_FACE_SHARE)
    centered = min(2 * min(cx, width - cx) / aspect, cy / FACE_Y, (height - cy) / (1 - FACE_Y))
    if centered < crop_h:
        crop_h = min(crop_h, max(centered, face.h / MAX_FACE_SHARE))
    return crop_h


def crop_box(width: int, height: int, face: Box | None, aspect: float = CARD_ASPECT,
             min_width: int = CARD_WIDTH) -> Box:
    """Crop of the given aspect inside the image, around the face when known,
    never narrower than min_width pixels when the image allows it: a card
    photo upscaled by the browser looks blurry."""
    full = min(height, width / aspect)
    crop_h = round(min(full, max(ideal_crop_height(width, height, face, aspect), min_width / aspect)))
    crop_w = min(width, round(crop_h * aspect))
    if face is None:
        x = (width - crop_w) // 2
        y = 0
    else:
        cx, cy = face.x + face.w / 2, face.y + face.h / 2
        x = round(cx - crop_w / 2)
        y = round(cy - crop_h * FACE_Y)
    x = min(max(x, 0), width - crop_w)
    y = min(max(y, 0), height - crop_h)
    return Box(x, y, crop_w, crop_h)


def to_card_webp(raw: bytes, width: int = CARD_WIDTH, quality: int = 82) -> tuple[bytes, int, int]:
    with Image.open(io.BytesIO(raw)) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")
        box = crop_box(img.width, img.height, find_face(img))
        img = img.crop((box.x, box.y, box.x + box.w, box.y + box.h))
        if img.width != width:
            # Old scans smaller than the card: enlarged here with a good
            # filter and a light sharpening, rather than by the browser.
            small = img.width < width
            img = img.resize((width, round(img.height * width / img.width)), Image.Resampling.LANCZOS)
            if small:
                img = img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
        out = io.BytesIO()
        img.save(out, format="WEBP", quality=quality, method=6)  # no exif/icc passed: metadata stripped
        return out.getvalue(), img.width, img.height


def ideal_crop_width(raw: bytes) -> float:
    """Source pixels across the best face crop: below CARD_WIDTH, a larger
    version of the picture gives a sharper card."""
    with Image.open(io.BytesIO(raw)) as img:
        img = ImageOps.exif_transpose(img)
        return ideal_crop_height(img.width, img.height, find_face(img)) * CARD_ASPECT


def has_face(raw: bytes) -> bool:
    with Image.open(io.BytesIO(raw)) as img:
        return find_face(ImageOps.exif_transpose(img)) is not None


def portrait_score(raw: bytes) -> float:
    """Face height over the picture's short side; 0 without a face or for a
    group photo (another face at least half as big: who is the player?)."""
    with Image.open(io.BytesIO(raw)) as img:
        img = ImageOps.exif_transpose(img)
        faces = find_faces(img)
        if not faces or (len(faces) > 1 and faces[1].w * faces[1].h >= 0.5 * faces[0].w * faces[0].h):
            return 0.0
        return faces[0].h / min(img.width, img.height)
