#!/usr/bin/env bash
# Yalnız bu testin izole imaj önbelleğini temizle. Varsayılan Docker'a dokunma.
set -euo pipefail
state=/var/tmp/adhd-mvp29-docker
[[ "$(realpath "$state")" == /var/tmp/adhd-mvp29-docker && -f "$state/managed-by-adhd-mvp29" ]] || exit 2
if [[ -f "$state/docker.pid" ]]; then
  pid="$(cat "$state/docker.pid")"
  [[ "$pid" =~ ^[0-9]+$ ]] || exit 2
  if kill -0 "$pid" 2>/dev/null; then
    tr '\0' ' ' <"/proc/$pid/cmdline" | grep -F -- "--data-root $state/data" >/dev/null || exit 2
    kill -TERM "$pid"
    for _ in $(seq 1 60); do if ! kill -0 "$pid" 2>/dev/null; then break; fi; sleep 1; done
    if kill -0 "$pid" 2>/dev/null; then echo 'Daemon still running; refusing cleanup.' >&2; exit 2; fi
  fi
fi
if pgrep -f "$state/data" >/dev/null; then echo 'A managed child is still using the cache.' >&2; exit 2; fi
for target in "$state/data" "$state/run"; do
  if [[ -e "$target" ]]; then
    resolved="$(realpath "$target")"
    [[ "$resolved" == "$state/data" || "$resolved" == "$state/run" ]] || exit 2
    rm -rf -- "$resolved"
  fi
done
echo 'Only the marked test daemon image/runtime cache was removed.'
