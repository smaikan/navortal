#!/usr/bin/env bash
# Sadece işaretli test Docker'ını kapat. İmajlar sonraki test için kalsın.
set -euo pipefail
state=/var/tmp/adhd-mvp29-docker
[[ "$(realpath "$state")" == "$state" && -f "$state/managed-by-adhd-mvp29" ]] || exit 2
pid="$(cat "$state/docker.pid")"
[[ "$pid" =~ ^[0-9]+$ ]] || exit 2
[[ -r "/proc/$pid/cmdline" ]] || exit 0
command="$(tr '\0' ' ' <"/proc/$pid/cmdline")"
[[ "$command" == *'/ADHD/API/.local/docker-tools/docker/dockerd '* && "$command" == *"--data-root $state/data"* ]] || exit 2
kill -TERM "$pid"
for _ in $(seq 1 30); do
  [[ -e "/proc/$pid" ]] || exit 0
  [[ "$(awk '{print $3}' "/proc/$pid/stat" 2>/dev/null || true)" == Z ]] && exit 0
  sleep 1
done
echo 'Dedicated daemon has not stopped; inspect it before restarting.' >&2
exit 1
