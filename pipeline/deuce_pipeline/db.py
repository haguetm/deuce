"""Idempotent writes to the catalogue tables (direct Postgres connection).

Every upsert is keyed on a natural key (wikidata_id, (player_id, key),
(player_id, lang), (player_id, commons_file)), so running the pipeline twice
yields the same database. Manual corrections are never overwritten:
rarity_override, in_catalog and image `hidden` flags are left untouched.
"""
from __future__ import annotations

import os

import psycopg

from .commons import CommonsImage
from .wikidata import WikidataPlayer, slugify
from .wikipedia import LICENSE as WIKIPEDIA_LICENSE, WikipediaText


def connect() -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is required (local: postgresql://postgres:postgres@127.0.0.1:54322/postgres)")
    return psycopg.connect(url)


def upsert_player(cur: psycopg.Cursor, p: WikidataPlayer, pageviews: int,
                  preferred_surface: str | None, career: tuple[int | None, int | None]) -> int:
    base_slug = slugify(p.name) or p.qid.lower()
    cur.execute("select wikidata_id from public.players where slug = %s", (base_slug,))
    row = cur.fetchone()
    slug = base_slug if row is None or row[0] == p.qid else f"{base_slug}-{p.qid.lower()}"

    start = p.career_start_year or career[0]
    end = p.career_end_year or career[1]
    cur.execute(
        """
        insert into public.players (wikidata_id, slug, name, sex, birth_date, country_code, hand,
          height_cm, career_start_year, career_end_year, preferred_surface,
          frwiki_title, enwiki_title, pageviews_12m, updated_at)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
        on conflict (wikidata_id) do update set
          name = excluded.name, sex = excluded.sex, birth_date = excluded.birth_date,
          country_code = excluded.country_code, hand = excluded.hand, height_cm = excluded.height_cm,
          career_start_year = excluded.career_start_year, career_end_year = excluded.career_end_year,
          preferred_surface = excluded.preferred_surface, frwiki_title = excluded.frwiki_title,
          enwiki_title = excluded.enwiki_title, pageviews_12m = excluded.pageviews_12m,
          updated_at = now()
        returning id
        """,
        (p.qid, slug, p.name, p.sex, p.birth_date, p.country_code, p.hand, p.height_cm,
         start, end, preferred_surface, p.frwiki_title, p.enwiki_title, pageviews),
    )
    return cur.fetchone()[0]


def upsert_stats(cur: psycopg.Cursor, player_id: int, stats: dict[str, float],
                 source_id: str, source_url: str) -> None:
    for key, value in stats.items():
        cur.execute(
            """
            insert into public.player_stats (player_id, key, value_num, source_id, source_url, imported_at)
            values (%s, %s, %s, %s, %s, now())
            on conflict (player_id, key) do update set
              value_num = excluded.value_num, source_id = excluded.source_id,
              source_url = excluded.source_url, imported_at = now()
            """,
            (player_id, key, value, source_id, source_url),
        )


def upsert_text(cur: psycopg.Cursor, player_id: int, text: WikipediaText) -> None:
    cur.execute(
        """
        insert into public.player_texts (player_id, lang, extract, article_url, license, revision_id, imported_at)
        values (%s, %s, %s, %s, %s, %s, now())
        on conflict (player_id, lang) do update set
          extract = excluded.extract, article_url = excluded.article_url,
          license = excluded.license, revision_id = excluded.revision_id, imported_at = now()
        """,
        (player_id, text.lang, text.extract, text.article_url, WIKIPEDIA_LICENSE, text.revision_id),
    )


def upsert_primary_image(cur: psycopg.Cursor, player_id: int, image: CommonsImage,
                         storage_path: str, width: int, height: int) -> None:
    # Demote any previous primary photo, then insert or refresh this one.
    # `hidden` is never reset: a masked photo stays masked after a re-import.
    cur.execute(
        "update public.player_images set is_primary = false where player_id = %s and commons_file <> %s",
        (player_id, image.commons_file),
    )
    cur.execute(
        """
        insert into public.player_images (player_id, commons_file, storage_path, width, height,
          author, license, license_url, source_url, is_primary, imported_at)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, true, now())
        on conflict (player_id, commons_file) do update set
          storage_path = excluded.storage_path, width = excluded.width, height = excluded.height,
          author = excluded.author, license = excluded.license, license_url = excluded.license_url,
          source_url = excluded.source_url, is_primary = true, imported_at = now()
        """,
        (player_id, image.commons_file, storage_path, width, height, image.author,
         image.license, image.license_url, image.source_url),
    )


def load_score_inputs(cur: psycopg.Cursor):
    cur.execute(
        """
        select p.wikidata_id, coalesce(p.pageviews_12m, 0),
               coalesce(jsonb_object_agg(s.key, s.value_num) filter (where s.key is not null), '{}')
        from public.players p
        left join public.player_stats s on s.player_id = p.id
        where p.in_catalog
        group by p.id
        """
    )
    return cur.fetchall()


def write_scores(cur: psycopg.Cursor, scores: dict[str, tuple[float, str]]) -> None:
    for qid, (score, tier) in scores.items():
        cur.execute(
            "update public.players set rarity_score = %s, rarity = %s, updated_at = now() where wikidata_id = %s",
            (score, tier, qid),
        )
