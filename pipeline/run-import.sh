#!/usr/bin/env bash
# Real import from your own machine (bash: Linux, macOS, WSL, Git Bash).
#
#   export PIPELINE_CONTACT="you@example.org"   # or a URL; required by Wikimedia
#   pipeline/run-import.sh            # 200 players (mini catalogue)
#   LIMIT=500 pipeline/run-import.sh
#
# Prerequisites: Python 3.12+, git, and the local Supabase started at the repo
# root (`pnpm db:start`). DATABASE_URL is read from `supabase status` unless set.
set -euo pipefail

PIPELINE_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$PIPELINE_DIR/.." && pwd)"
LIMIT="${LIMIT:-200}"

if [ -z "${PIPELINE_CONTACT:-}" ]; then
  echo "PIPELINE_CONTACT is not set (email or URL used in the User-Agent)." >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  DATABASE_URL="$(cd "$ROOT" && pnpm exec supabase status -o env | sed -n 's/^DB_URL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p')"
  if [ -z "$DATABASE_URL" ]; then
    echo "Could not read DB_URL from 'supabase status'. Run 'pnpm db:start' first." >&2
    exit 1
  fi
fi
export DATABASE_URL PIPELINE_CONTACT
export IMAGE_STORAGE_PROVIDER="${IMAGE_STORAGE_PROVIDER:-local}"
export PIPELINE_MIN_INTERVAL_S="${PIPELINE_MIN_INTERVAL_S:-1.0}"

# Sackmann datasets (CC BY-NC-SA 4.0, never committed)
mkdir -p "$PIPELINE_DIR/data"
for tour in atp wta; do
  dir="$PIPELINE_DIR/data/tennis_$tour"
  if [ -d "$dir/.git" ]; then
    git -C "$dir" pull --ff-only --quiet
  else
    git clone --depth 1 --quiet "https://github.com/JeffSackmann/tennis_$tour" "$dir"
  fi
  echo "tennis_$tour: $(ls "$dir"/${tour}_matches_[0-9]*.csv 2>/dev/null | wc -l | tr -d ' ') match files"
done

if [ ! -x "$PIPELINE_DIR/.venv/bin/deuce-pipeline" ]; then
  python3 -m venv "$PIPELINE_DIR/.venv"
  "$PIPELINE_DIR/.venv/bin/pip" install --quiet -e "$PIPELINE_DIR"
fi

cd "$PIPELINE_DIR"
.venv/bin/deuce-pipeline import --limit "$LIMIT"
