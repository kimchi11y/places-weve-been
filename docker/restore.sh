#!/bin/sh
# Puts a backup back: docker/restore.sh 2026-11-06-143000-000
# REPLACES the site's trips and photos, after asking.
set -eu
cd "$(dirname "$0")/.."
exec docker compose run --rm restore node dist-node/tools/restore.mjs "${1:-}"
