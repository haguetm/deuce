#!/usr/bin/env bash
# Scans the WHOLE git history (all branches and tags) for secrets with
# gitleaks, then checks that .gitignore keeps env files, private notes and
# downloaded data out of the repository.
# Usage: scripts/scan-secrets.sh   (exit code != 0 when something is found)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
GITLEAKS_VERSION="8.28.0"
status=0

# 1. gitleaks on the full history --------------------------------------------
GITLEAKS="$(command -v gitleaks || true)"
if [ -z "$GITLEAKS" ]; then
  GITLEAKS="$ROOT/.cache/tools/gitleaks-$GITLEAKS_VERSION"
  if [ ! -x "$GITLEAKS" ]; then
    echo "Downloading gitleaks $GITLEAKS_VERSION..."
    mkdir -p "$ROOT/.cache/tools"
    tmp="$(mktemp -d)"
    curl -fsSL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
      | tar -xz -C "$tmp" gitleaks
    mv "$tmp/gitleaks" "$GITLEAKS"
    rm -rf "$tmp"
  fi
fi

echo "== gitleaks: full history ($(git rev-list --all | wc -l | tr -d ' ') commits)"
if ! "$GITLEAKS" git --log-opts="--all" --redact --no-banner "$ROOT"; then
  status=1
fi

# 2. .gitignore coverage -----------------------------------------------------
echo "== .gitignore coverage"
must_ignore=(
  ".env" ".env.local" ".env.production" ".env.development.local"
  "docs/private/LEGAL-REVIEW.md"
  "data/raw/players.json"
  "pipeline/data/tennis_atp/atp_matches_2024.csv"
  "pipeline/downloads/commons/file.jpg"
  "pipeline/.cache/wikidata.json"
  "tennis_wta/wta_players.csv"
)
for path in "${must_ignore[@]}"; do
  if ! git check-ignore -q --no-index "$path"; then
    echo "NOT IGNORED: $path"
    status=1
  fi
done
if git check-ignore -q --no-index ".env.example"; then
  echo "WRONGLY IGNORED: .env.example must stay versioned"
  status=1
fi

# 3. Tracked files that should never be versioned -----------------------------
echo "== tracked files"
offenders="$(git ls-files | grep -E '(^|/)\.env($|\.)|(^|/)docs/private/|(^|/)tennis_(atp|wta)|\.(pem|key|p12)$' | grep -vx '.env.example' || true)"
if [ -n "$offenders" ]; then
  echo "FORBIDDEN TRACKED FILES:"
  echo "$offenders"
  status=1
fi

if [ "$status" -eq 0 ]; then echo "OK: no secret found, ignore rules in place."; fi
exit "$status"
