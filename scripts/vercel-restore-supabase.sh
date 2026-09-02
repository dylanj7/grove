#!/usr/bin/env bash
# Restore Grove's Supabase environment variables into the linked Vercel project.
#
# Reads the values out of .env.local so no secret is ever copied by hand. For
# each variable it removes any existing copy first, then re-adds it — so running
# this twice is safe, and a stale value can never survive underneath a new one.
#
#   ./scripts/vercel-restore-supabase.sh              # all three environments
#   ./scripts/vercel-restore-supabase.sh production   # just one
#
# Prerequisites: `vercel login` and `vercel link` have both been run.

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env.local"
TARGETS=("${@:-production preview development}")
# shellcheck disable=SC2206
TARGETS=(${TARGETS[*]})

VARS=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  SUPABASE_SECRET_KEY
)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found — run this from the grove repo." >&2
  exit 1
fi

if ! command -v vercel >/dev/null 2>&1; then
  echo "error: vercel CLI not found. Run: npm i -g vercel" >&2
  exit 1
fi

if [[ ! -d .vercel ]]; then
  echo "error: this repo isn't linked to a Vercel project. Run: vercel link" >&2
  exit 1
fi

# Pull a value from .env.local, tolerating quotes and trailing whitespace.
read_env() {
  local key="$1" line
  line="$(grep -m1 "^${key}=" "$ENV_FILE" || true)"
  [[ -z "$line" ]] && return 1
  local value="${line#*=}"
  value="${value%"${value##*[![:space:]]}"}"
  value="${value#\"}"; value="${value%\"}"
  value="${value#\'}"; value="${value%\'}"
  printf '%s' "$value"
}

for target in "${TARGETS[@]}"; do
  echo "── $target ──"
  for name in "${VARS[@]}"; do
    if ! value="$(read_env "$name")" || [[ -z "$value" ]]; then
      echo "  skip $name (absent from $ENV_FILE)"
      continue
    fi

    # Remove any existing copy. Absent is fine; that is the common case here.
    vercel env rm "$name" "$target" --yes >/dev/null 2>&1 || true

    printf '%s' "$value" | vercel env add "$name" "$target" >/dev/null
    echo "  set  $name (${#value} chars)"
  done
done

echo
echo "Done. Verify with:  vercel env ls"
echo "Env vars only reach a deployment at build time — redeploy to pick them up:"
echo "  vercel --prod"
