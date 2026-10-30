import io

from PIL import Image

from deuce_pipeline import images, storage


def _jpeg(width, height):
    img = Image.new("RGB", (width, height), (10, 20, 30))
    exif = Image.Exif()
    exif[0x013B] = "Secret Artist Location"  # Artist tag
    out = io.BytesIO()
    img.save(out, format="JPEG", exif=exif)
    return out.getvalue()


def test_cropped_to_the_card_frame_and_metadata_stripped():
    body, w, h = images.to_card_webp(_jpeg(800, 1000))
    assert w == 400 and abs(h - 400 / images.CARD_ASPECT) <= 1
    with Image.open(io.BytesIO(body)) as img:
        assert img.format == "WEBP"
        assert not img.getexif()


def test_small_images_are_enlarged_to_the_card_width():
    _, w, h = images.to_card_webp(_jpeg(300, 300))
    assert w == images.CARD_WIDTH and abs(h - 400 / images.CARD_ASPECT) <= 1


def test_face_model_loads_and_finds_nothing_on_a_blank_picture():
    assert images.find_face(Image.new("RGB", (640, 480), (200, 200, 200))) is None


def test_without_a_face_the_crop_keeps_the_top_center():
    box = images.crop_box(1600, 1000, None)
    assert box.y == 0 and box.h == 1000
    assert box.x == (1600 - box.w) // 2


def test_crop_is_centered_on_the_face_and_stays_inside():
    face = images.Box(x=1300, y=200, w=100, h=100)
    box = images.crop_box(1600, 1000, face)
    assert abs(box.w / box.h - images.CARD_ASPECT) < 0.01
    assert box.x + box.w <= 1600 and box.y >= 0  # clamped at the right edge
    assert box.x <= face.x and face.x + face.w <= box.x + box.w
    centered = images.crop_box(1600, 1000, images.Box(x=750, y=300, w=100, h=100))
    assert abs((centered.x + centered.w / 2) - 800) <= 1


def test_wide_shot_zooms_in_on_a_small_face_but_keeps_card_resolution():
    face = images.Box(x=1500, y=800, w=100, h=100)
    assert images.crop_box(3000, 2000, face, min_width=0).h == 500  # face at 20 %
    # Too few pixels for a sharp card: a wider crop (or a larger source).
    assert images.crop_box(3000, 2000, images.Box(x=1500, y=800, w=60, h=60)).w >= images.CARD_WIDTH


def test_crop_tightens_to_center_a_face_near_the_edge():
    face = images.Box(x=800, y=300, w=100, h=100)  # center 850 in a 1000 px wide picture
    box = images.crop_box(1000, 1000, face, min_width=0)
    assert abs((box.x + box.w / 2) - 850) <= 1
    assert face.h / box.h <= images.MAX_FACE_SHARE + 0.01


def test_object_key_is_content_addressed():
    assert storage.object_key("Q1", b"a") != storage.object_key("Q1", b"b")
    assert storage.object_key("Q1", b"a").startswith("players/Q1/")


def test_a_close_portrait_in_a_big_picture_is_found_on_a_reduced_copy(monkeypatch):
    calls = []

    def detect(img):
        calls.append(img.size)
        return [images.Box(10, 10, 100, 120)] if max(img.size) <= images.DETECT_SIDE else []

    monkeypatch.setattr(images, "_detect", detect)
    faces = images.find_faces(Image.new("RGB", (1280, 1707)))
    assert calls[0][1] == images.DETECT_SIDE
    assert faces[0].h == round(120 * 1707 / images.DETECT_SIDE)
