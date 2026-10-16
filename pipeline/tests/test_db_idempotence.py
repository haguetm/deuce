"""Running the import twice gives the same database; manual moderation survives."""
import psycopg

from deuce_pipeline import db, scoring
from deuce_pipeline.commons import CommonsImage
from deuce_pipeline.wikidata import WikidataPlayer
from deuce_pipeline.wikipedia import WikipediaText


def _player(qid="Q999999990", name="Zoé Testeuse"):
    return WikidataPlayer(qid=qid, name=name, sex="female", birth_date=None, country_code="FR",
                          hand="left", height_cm=178, commons_file="File:Z.jpg", career_start_year=2008,
                          career_end_year=None, frwiki_title=name, enwiki_title=None, atp_id=None, wta_id=None)


IMAGE = CommonsImage("File:Z.jpg", "https://upload.example/z.jpg", "Jane", "CC BY-SA 4.0",
                     "https://creativecommons.org/licenses/by-sa/4.0", "https://commons.wikimedia.org/wiki/File:Z.jpg")


def _import(cur, player):
    pid = db.upsert_player(cur, player, 1234, "clay", (2008, None))
    db.upsert_stats(cur, pid, {"best_rank": 12, "titles": 3}, "sackmann_wta", "https://github.com/JeffSackmann/tennis_wta")
    db.upsert_text(cur, pid, WikipediaText("fr", "Joueuse fictive.", "https://fr.wikipedia.org/wiki/Z", 1))
    db.upsert_primary_image(cur, pid, IMAGE, "players/Q999999990/abc.webp", 400, 500)
    return pid


def _snapshot(cur):
    out = {}
    for table in ("players", "player_stats", "player_texts", "player_images"):
        cur.execute(f"select count(*) from public.{table}")
        out[table] = cur.fetchone()[0]
    return out


def test_import_is_idempotent_and_keeps_moderation(database_url):
    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        first_id = _import(cur, _player())
        before = _snapshot(cur)

        # Moderation done between two runs
        cur.execute("update public.player_images set hidden = true where player_id = %s", (first_id,))
        cur.execute("update public.players set rarity_override = 'epic' where id = %s", (first_id,))

        second_id = _import(cur, _player())
        assert second_id == first_id
        assert _snapshot(cur) == before == {"players": 1, "player_stats": 2, "player_texts": 1, "player_images": 1}

        cur.execute("select hidden from public.player_images where player_id = %s", (first_id,))
        assert cur.fetchone()[0] is True, "a masked photo must stay masked after re-import"
        cur.execute("select rarity_override, slug from public.players where id = %s", (first_id,))
        assert cur.fetchone() == ("epic", "zoe-testeuse")
        conn.rollback()


def test_slug_collision_gets_qid_suffix(database_url):
    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        db.upsert_player(cur, _player("Q999999990", "Same Name"), 0, None, (None, None))
        db.upsert_player(cur, _player("Q999999991", "Same Name"), 0, None, (None, None))
        cur.execute("select slug from public.players order by wikidata_id")
        assert [r[0] for r in cur.fetchall()] == ["same-name", "same-name-q999999991"]
        conn.rollback()


def test_scores_written_from_database(database_url):
    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        for i in range(10):
            pid = db.upsert_player(cur, _player(f"Q99999990{i}", f"Player {i}"), i * 1000, None, (None, None))
            db.upsert_stats(cur, pid, {"best_rank": 100 - i}, "sackmann_atp", "https://x")
        inputs = [scoring.ScoreInput(q, {k: float(v) for k, v in s.items()}, v) for q, v, s in db.load_score_inputs(cur)]
        db.write_scores(cur, scoring.score_catalogue(inputs, scoring.load_config()))
        cur.execute("select wikidata_id from public.players where rarity = 'mythic'")
        assert [r[0] for r in cur.fetchall()] == ["Q999999909"]
        conn.rollback()
