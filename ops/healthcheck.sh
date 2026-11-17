#!/usr/bin/env bash
# Her 5 dakikada site ve konteyner durumunu kontrol eder; yalniz durum degisince log yazar.
LOG=/var/log/navortal-health.log
STATE=/var/run/navortal-health.state
problems=""
code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' http://127.0.0.1:3100/login || true)
[ "$code" = "200" ] || problems="$problems ui=$code"
for c in navortal-ui-1 navortal-api-1 navortal-db-1; do
  [ "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)" = "true" ] || problems="$problems $c=durdu"
done
use=$(df -P / | awk 'NR==2{gsub("%","",$5);print $5}')
[ "$use" -lt 92 ] || problems="$problems disk=%$use"
last=$(cat "$STATE" 2>/dev/null || echo "")
now="${problems:-ok}"
if [ "$now" != "$last" ]; then echo "$(date -Is) $now" >> "$LOG"; echo "$now" > "$STATE"; fi
