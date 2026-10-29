/**
 * Tops up aces on the LOCAL development database, to test everything that
 * costs aces without playing for them.
 *   pnpm db:dev:aces                 every local account
 *   pnpm db:dev:aces you@example.org one account
 * Brings each balance to 1 billion aces with an `admin_adjustment` ledger
 * entry (append-only, like any other credit). Refuses any non-local database.
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const TARGET = 1_000_000_000;

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
    throw new Error(`refusing to credit aces on a non-local database (${host})`);
  }
  const email = process.argv[2] ?? null;

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string; email: string | null; balance: string }>(
      `select u.id, u.email, coalesce(b.balance, 0) as balance
       from auth.users u left join public.balances b on b.user_id = u.id
       where $1::text is null or lower(u.email) = lower($1)`,
      [email],
    );
    if (rows.length === 0) throw new Error(email ? `no local account for ${email}` : "no local account yet");
    for (const row of rows) {
      const missing = TARGET - Number(row.balance);
      if (missing > 0) {
        await client.query(
          `insert into public.ledger (user_id, amount, reason, ref, idempotency_key)
           values ($1, $2, 'admin_adjustment', 'dev-aces', $3)`,
          [row.id, missing, `dev-aces:${randomUUID()}`],
        );
      }
      console.log(`${row.email ?? row.id}: ${TARGET.toLocaleString("en")} aces`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
