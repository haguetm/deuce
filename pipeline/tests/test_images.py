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


def test_resized_to_card_width_and_metadata_stripped():
    body, w, h = images.to_card_webp(_jpeg(800, 1000))
    assert (w, h) == (400, 500)
    with Image.open(io.BytesIO(body)) as img:
        assert img.format == "WEBP"
        assert not img.getexif()


def test_small_images_are_not_upscaled():
    _, w, h = images.to_card_webp(_jpeg(300, 400))
    assert (w, h) == (300, 400)


def test_object_key_is_content_addressed():
    assert storage.object_key("Q1", b"a") != storage.object_key("Q1", b"b")
    assert storage.object_key("Q1", b"a").startswith("players/Q1/")
