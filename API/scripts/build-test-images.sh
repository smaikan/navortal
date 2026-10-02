#!/usr/bin/env bash
set -euo pipefail
api_root="$(cd "$(dirname "$0")/.." && pwd)"
export DOCKER_HOST=unix:///var/tmp/adhd-mvp29-docker/docker.sock
export DOCKER_CONFIG="$api_root/.local/docker-tools/config"
docker="$api_root/.local/docker-tools/docker/docker"
"$docker" build --network=host --progress=plain --target build -t adhd-migrate:mvp29 "$api_root" >"$api_root/.local/docker-tools/migrate-build.log" 2>&1
"$docker" build --network=host --progress=plain -t adhd-api:mvp29 "$api_root" >"$api_root/.local/docker-tools/api-build.log" 2>&1
"$docker" image inspect adhd-api:mvp29 --format '{{.Id}} user={{.Config.User}}'
