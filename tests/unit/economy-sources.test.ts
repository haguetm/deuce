import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SIMULATED_ACE_SOURCES } from "@/lib/game/economy";

/**
 * Guard: every ledger reason that SQL code can CREDIT must be covered by the
 * economy simulation. Adding a new source of aces (referral, quests...) makes
 * this test fail until scripts/simulate-economy.ts models it and
 * SIMULATED_ACE_SOURCES is updated (see docs/DECISIONS.md).
 */
const MIGRATIONS = path.resolve(__dirname, "../../supabase/migrations");
const DEBITS_OR_MANUAL = new Set([
  "booster_purchase",
  "grading",
  "admin_adjustment",
]);

/** Reasons from the CREATE TYPE and every later ALTER TYPE ... ADD VALUE. */
function ledgerReasons(sql: string): string[] {
  const enumMatch = sql.match(
    /create type public\.ledger_reason as enum \(([\s\S]*?)\);/,
  );
  const created = enumMatch
    ? [...enumMatch[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    : [];
  const added = [
    ...sql.matchAll(
      /alter type public\.ledger_reason add value (?:if not exists )?'([a-z_]+)'/g,
    ),
  ].map((m) => m[1]);
  return [...created, ...added];
}

describe("economy simulation coverage", () => {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const sql = files
    .map((f) => readFileSync(path.join(MIGRATIONS, f), "utf8"))
    .join("\n");
  const reasons = ledgerReasons(sql);

  it("finds the ledger reasons", () => {
    expect(reasons).toContain("recycle");
    expect(reasons).toContain("login_streak");
  });

  it("every ace source written by SQL code is simulated", () => {
    const inserts = [
      ...sql.matchAll(/insert into public\.ledger[\s\S]*?;/gi),
    ].map((m) => m[0]);
    const used = new Set(
      inserts.flatMap((stmt) => reasons.filter((r) => stmt.includes(`'${r}'`))),
    );
    const credited = [...used].filter((r) => !DEBITS_OR_MANUAL.has(r));
    const missing = credited.filter((r) => !SIMULATED_ACE_SOURCES.includes(r));
    expect(
      missing,
      "re-run and extend the economy simulation for these sources",
    ).toEqual([]);
  });
});
