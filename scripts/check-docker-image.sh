#!/bin/sh
# Starts the Docker image the way compose.yaml does, without Tailscale, and checks who gets in.
#   scripts/check-docker-image.sh places-weve-been
set -eu
image=$1
name="places-check-$$"
trap 'docker rm -f "$name" >/dev/null 2>&1; docker volume rm "$name" >/dev/null 2>&1 || true' EXIT

start() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" --network none --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true --init \
    -v "$name:/data" -e EDITORS=ana@example.com "$@" "$image" >/dev/null
  for _ in $(seq 1 30); do
    [ "$(status /)" = 000 ] || return 0
    sleep 1
  done
  docker logs "$name"
  echo "The site never started." && exit 1
}
# The status for a path, signed in as someone or (without a second argument) not
status() {
  docker exec -e WHO="${2:-}" -e AT="http://127.0.0.1:4321$1" "$name" node -e '
    const headers = process.env.WHO ? { "tailscale-user-login": process.env.WHO } : {};
    fetch(process.env.AT, { headers }).then((r) => console.log(r.status), () => console.log("000"))' 2>/dev/null || echo 000
}
expect() {
  got=$(status "$2" "${3:-}")
  [ "$got" = "$1" ] || { docker logs "$name"; echo "Expected $1 for $2 as ${3:-a stranger}, got $got"; exit 1; }
  echo "ok: $1 for $2 as ${3:-a stranger}"
}

start -e AUTH=tailscale
expect 403 /
expect 200 / gran@example.com
expect 403 /admin gran@example.com
expect 200 /admin ana@example.com
expect 200 /admin/api/trips ana@example.com
docker run --rm --network none --tmpfs /backups:mode=1777 -v "$name:/data:ro" -e BACKUP_DIR=/backups "$image" node dist-node/tools/backup.mjs

start -e AUTH=
expect 503 / ana@example.com
start -e AUTH=tailscale -e HOST=0.0.0.0
expect 503 /admin ana@example.com
[ "$(docker exec "$name" id -u)" != 0 ] && echo "ok: not running as root"
