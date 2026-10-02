#!/usr/bin/env bash
# Yerel test kendi Docker ayarlarıyla çalışır. Sistem hizmeti kurmaz.
set -euo pipefail
api_root="$(cd "$(dirname "$0")/.." && pwd)"
tools="$api_root/.local/docker-tools"
state="${1:?Pass a dedicated absolute Linux state directory}"
case "$state" in /var/tmp/adhd-mvp29-docker*) ;; *) echo 'Refusing an unrelated daemon state directory.' >&2; exit 2;; esac
if [[ -d "$state" && ! -f "$state/managed-by-adhd-mvp29" ]]; then echo 'Existing directory has no ownership marker.' >&2; exit 2; fi
mkdir -p "$state"
touch "$state/managed-by-adhd-mvp29"
export PATH="$tools/docker:$PATH"
export DOCKER_HOST="unix://$state/docker.sock"
export DOCKER_CONFIG="$tools/config"
mkdir -p "$DOCKER_CONFIG/cli-plugins"
ln -sf "$tools/docker-compose" "$DOCKER_CONFIG/cli-plugins/docker-compose"
if "$tools/docker/docker" info >/dev/null 2>&1; then "$tools/docker/docker" version --format '{{.Server.Version}}'; exit 0; fi
printf '%s\n' '{"features":{"containerd-snapshotter":false}}' >"$state/daemon.json"
nohup "$tools/docker/dockerd" --config-file "$state/daemon.json" -H "$DOCKER_HOST" --pidfile "$state/docker.pid" \
  --data-root "$state/data" --exec-root "$state/run" --iptables=false --ip6tables=false --ip-masq=false --bridge=none \
  --storage-driver="${ADHD_TEST_DOCKER_DRIVER:-overlay2}" --log-level=error >"$state/daemon.log" 2>&1 </dev/null &
for _ in $(seq 1 60); do
  if "$tools/docker/docker" info >/dev/null 2>&1; then "$tools/docker/docker" version --format '{{.Server.Version}}'; exit 0; fi
  sleep 1
done
echo 'Isolated Docker did not become ready; inspect the dedicated daemon.log.' >&2
exit 1
