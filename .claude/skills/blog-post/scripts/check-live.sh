#!/usr/bin/env bash
#
# check-live.sh — Poll the live site until posts/<slug>/index.html is deployed.
#
# Usage: .claude/skills/blog-post/scripts/check-live.sh <slug> [max_attempts]
#
# Succeeds when the SHA-256 of the live page matches the local file, proving
# the *current* version is deployed (a plain 200 could be a stale cache).
#
set -euo pipefail

slug="${1:?usage: check-live.sh <slug> [max_attempts]}"
max="${2:-10}"

repo_root="$(cd "$(dirname "$0")/../../../.." && pwd)"
local_file="$repo_root/posts/$slug/index.html"
url="https://pranav.com.au/posts/$slug/"

[ -f "$local_file" ] || { echo "error: $local_file not found" >&2; exit 1; }

local_hash="$(shasum -a 256 "$local_file" | cut -d' ' -f1)"

for i in $(seq 1 "$max"); do
  live_hash="$(curl -sf "$url" | shasum -a 256 | cut -d' ' -f1 || true)"
  if [ "$live_hash" = "$local_hash" ]; then
    echo "attempt $i: LIVE — $url matches local copy"
    exit 0
  fi
  echo "attempt $i: not yet deployed (or stale version live)"
  [ "$i" -lt "$max" ] && sleep 15
done

echo "gave up after $max attempts — check the GitHub Pages build" >&2
exit 1
