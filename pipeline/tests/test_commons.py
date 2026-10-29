import pytest

from deuce_pipeline import commons


@pytest.mark.parametrize("name", ["CC BY-SA 4.0", "CC BY 2.0", "CC BY-SA 3.0 de", "CC0", "Public domain", "PD-self"])
def test_free_licenses_are_allowed(name):
    assert commons.license_allowed(name)


@pytest.mark.parametrize("name", ["CC BY-NC 2.0", "CC BY-NC-SA 4.0", "CC BY-ND 3.0", "Fair use", "", "All rights reserved"])
def test_restricted_licenses_are_rejected(name):
    assert not commons.license_allowed(name)


def _response(license_name, artist="<a href='x'>Jane Photographer</a>", license_url="https://creativecommons.org/licenses/by-sa/4.0"):
    meta = {"LicenseShortName": {"value": license_name}, "LicenseUrl": {"value": license_url}}
    if artist is not None:
        meta["Artist"] = {"value": artist}
    return {"query": {"pages": [{"imageinfo": [{
        "thumburl": "https://upload.example/thumb/400px-x.jpg",
        "descriptionurl": "https://commons.wikimedia.org/wiki/File:X.jpg",
        "extmetadata": meta,
    }]}]}}


def test_accepted_image_keeps_full_attribution():
    image, reason = commons.parse_imageinfo("File:X.jpg", _response("CC BY-SA 4.0"))
    assert reason is None
    assert image.author == "Jane Photographer"  # HTML stripped
    assert image.license == "CC BY-SA 4.0"
    assert image.license_url.startswith("https://creativecommons.org/")
    assert image.source_url == "https://commons.wikimedia.org/wiki/File:X.jpg"


def test_nc_image_is_rejected_with_reason():
    image, reason = commons.parse_imageinfo("File:X.jpg", _response("CC BY-NC 2.0"))
    assert image is None and "not allowed" in reason


def test_attribution_license_without_author_is_rejected():
    image, reason = commons.parse_imageinfo("File:X.jpg", _response("CC BY 4.0", artist=None))
    assert image is None and "author" in reason


def test_public_domain_without_author_is_accepted():
    image, _ = commons.parse_imageinfo("File:X.jpg", _response("Public domain", artist=None, license_url=""))
    assert image is not None and image.license_url


def test_photo_year_from_date_taken_or_file_name():
    response = _response("CC BY-SA 4.0")
    response["query"]["pages"][0]["imageinfo"][0]["extmetadata"]["DateTimeOriginal"] = {"value": "2006-07-08 14:02"}
    assert commons.parse_imageinfo("File:X.jpg", response)[0].year == 2006
    assert commons.parse_imageinfo("File:X at Wimbledon 1998.jpg", _response("CC BY-SA 4.0"))[0].year == 1998
    assert commons.parse_imageinfo("File:X.jpg", _response("CC BY-SA 4.0"))[0].year is None


def _image(name, year):
    return commons.CommonsImage(name, "", "a", "CC0", "", "", year)


def test_era_photos_are_from_the_career_peak_first():
    ranked = commons.rank_era_photos(
        [_image("old", 2019), _image("late", 2009), _image("peak", 2001), _image("undated", None)],
        (1993, 2009), "Zoé Testeuse",
    )
    assert [i.commons_file for i in ranked] == ["peak", "late"]


def test_era_photos_named_after_the_player_come_first():
    ranked = commons.rank_era_photos(
        [_image("File:Davis Cup final 2001.jpg", 2001), _image("File:Zoé TESTEUSE at Wimbledon.jpg", 2008)],
        (1993, 2009), "Zoé Testeuse",
    )
    assert ranked[0].commons_file == "File:Zoé TESTEUSE at Wimbledon.jpg"


def test_dated_subcategories_inside_the_career_only():
    titles = ["Category:X in 2019", "Category:X at the 2006 Wimbledon Championships",
              "Category:X in 1995", "Category:Signatures of X"]
    assert commons.dated_subcategories(titles, (1993, 2009)) == [
        "Category:X in 1995", "Category:X at the 2006 Wimbledon Championships"]


def test_missing_file():
    assert commons.parse_imageinfo("File:X.jpg", {"query": {"pages": [{"missing": True}]}})[0] is None
