#!/bin/sh
# Saves the site's trips and photos to ./backups. The site can stay up.
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
# As you, so the files are yours
exec docker compose run --rm --user "$(id -u):$(id -g)" backup
