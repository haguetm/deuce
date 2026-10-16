/**
 * Loads ~100 fictional players into the LOCAL development database.
 *   pnpm db:seed:dev
 * Refuses any non-local database. Rows are flagged is_dev_seed and the
 * database guard only accepts them because this transaction declares
 * app.environment = 'development'. Idempotent (upsert on wikidata_id).
 */
import { execSync } from "node:child_process";
import { Client } from "pg";
import { fictionalPlayers } from "../../src/lib/dev/fictional-players";

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const status = execSync("pnpm exec supabase status -o env", { encoding: "utf8" });
  const match = status.match(/^DB_URL="?([^"\n]+)"?$/m);
  if (!match) throw new Error("DATABASE_URL not set and `supabase status` has no DB_URL (run pnpm db:start)");
  return match[1];
}

async function main() {
  const url = databaseUrl();
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error(`refusing to seed fictional data into a non-local database (${host})`);
  }

  const players = fictionalPlayers();
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.environment', 'development', true)");
    await client.query(
      `insert into public.data_sources (id, name, url, license, license_url, commercial_use_allowed)
       values ('dev_seed', 'Fictional development data', 'https://example.invalid/dev-seed',
               'Fictional data', 'https://example.invalid/dev-seed', true)
       on conflict (id) do nothing`,
    );
    for (const p of players) {
      const { rows } = await client.query(
        `insert into public.players (wikidata_id, slug, name, sex, birth_date, country_code, hand, height_cm,
           career_start_year, career_end_year, preferred_surface, pageviews_12m, rarity, rarity_score, is_dev_seed)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true)
         on conflict (wikidata_id) do update set name = excluded.name, rarity = excluded.rarity,
           rarity_score = excluded.rarity_score, pageviews_12m = excluded.pageviews_12m, updated_at = now()
         returning id`,
        [p.wikidataId, p.slug, p.name, p.sex, p.birthDate, p.countryCode, p.hand, p.heightCm,
         p.careerStartYear, p.careerEndYear, p.preferredSurface, p.pageviews12m, p.rarity, p.rarityScore],
      );
      const id = rows[0].id;
      for (const [key, value] of Object.entries(p.stats)) {
        await client.query(
          `insert into public.player_stats (player_id, key, value_num, source_id, source_url)
           values ($1, $2, $3, 'dev_seed', 'https://example.invalid/dev-seed')
           on conflict (player_id, key) do update set value_num = excluded.value_num`,
          [id, key, value],
        );
      }
      for (const lang of ["fr", "en"] as const) {
        await client.query(
          `insert into public.player_texts (player_id, lang, extract, article_url, license)
           values ($1, $2, $3, 'https://example.invalid/dev-seed', 'Fictional data')
           on conflict (player_id, lang) do update set extract = excluded.extract`,
          [id, lang, p.bio[lang]],
        );
      }
    }
    await client.query("commit");
    console.log(`seeded ${players.length} fictional players (is_dev_seed = true) into ${host}`);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
