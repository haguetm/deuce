#!/usr/bin/env bash
# Runs migrations + pgTAP tests on a throwaway local PostgreSQL cluster,
# without Docker. Requires PostgreSQL 15+ server binaries and pgTAP
# (Debian/Ubuntu: apt install postgresql-16 postgresql-16-pgtap).
# The reference test run remains `pnpm db:test` (real Supabase, used in CI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-54399}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  chown postgres "$WORK"
  RUN_AS=(runuser -u postgres --)
fi

cleanup() { "${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

"${RUN_AS[@]}" "$PG_BIN/initdb" -D "$WORK/data" -U postgres --auth=trust >/dev/null
"${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" start >/dev/null

PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/scripts/db/supabase-shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f "$ROOT/supabase/seed.sql"
"${PSQL[@]}" -f "$ROOT/supabase/seed-game-config.sql"
"${PSQL[@]}" -c "create extension if not exists pgtap with schema extensions;"

PGOPTIONS="-c search_path=public,extensions" pg_prove -h "$WORK" -p "$PORT" -U postgres -d postgres \
  "$ROOT"/supabase/tests/*.sql
