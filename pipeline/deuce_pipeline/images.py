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
from PIL import Image, ImageOps

CARD_WIDTH = 400
# Width / height of the photo area of a card (5:7 card minus the caption).
CARD_ASPECT = 0.85
# Where the face center sits in the crop, from the top.
FACE_Y = 0.36
# The face takes at least this share of the crop height (tighter on wide shots)...
MIN_FACE_SHARE = 0.2
# ...but the crop never gets smaller than this many source pixels high.
MIN_CROP_HEIGHT = 320
FACE_MODEL = Path(__file__).resolve().parent.parent / "models" / "face_detection_yunet_2023mar.onnx"
FACE_SCORE = 0.8
# Faces smaller than this share of the picture's short side are crowd or background.
MIN_FACE_SIDE = 0.03

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
    """Confident sizeable faces, largest first."""
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


def crop_box(width: int, height: int, face: Box | None, aspect: float = CARD_ASPECT) -> Box:
    """Crop of the given aspect inside the image, around the face when known."""
    crop_h = min(height, round(width / aspect))
    if face is not None:
        # Wide shot: zoom in so the face is not lost in the frame.
        crop_h = min(crop_h, max(round(face.h / MIN_FACE_SHARE), MIN_CROP_HEIGHT))
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
        if img.width > width:
            img = img.resize((width, round(img.height * width / img.width)), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="WEBP", quality=quality, method=6)  # no exif/icc passed: metadata stripped
        return out.getvalue(), img.width, img.height


def portrait_score(raw: bytes) -> float:
    """Face height over the picture's short side; 0 without a face or for a
    group photo (another face at least half as big: who is the player?)."""
    with Image.open(io.BytesIO(raw)) as img:
        img = ImageOps.exif_transpose(img)
        faces = find_faces(img)
        if not faces or (len(faces) > 1 and faces[1].w * faces[1].h >= 0.5 * faces[0].w * faces[0].h):
            return 0.0
        return faces[0].h / min(img.width, img.height)
