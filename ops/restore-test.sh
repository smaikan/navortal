#!/usr/bin/env bash
# Son yedegi gecici bir Postgres'e yukler ve canli veritabaniyla tablo/satir sayilarini karsilastirir.
set -euo pipefail
DIR=/var/backups/navortal
LATEST=$(ls -1t "$DIR"/adhd-*.dump | head -n1)
[ -n "$LATEST" ] || { echo "$(date -Is) HATA: yedek yok"; exit 1; }
T=navortal-restore-test
cleanup() { docker rm -f "$T" > /dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
docker run -d --name "$T" -e POSTGRES_PASSWORD=test -e POSTGRES_USER=adhd -e POSTGRES_DB=adhd \
  postgres:18.6@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42 > /dev/null
for i in $(seq 1 40); do docker exec "$T" pg_isready -h 127.0.0.1 -U adhd -d adhd > /dev/null 2>&1 && break; sleep 2; done
docker exec -i "$T" pg_restore -U adhd -d adhd --no-owner --exit-on-error < "$LATEST"
Q="select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')"
live=$(docker exec navortal-db-1 psql -U adhd -d adhd -Atc "$Q")
rest=$(docker exec "$T" psql -U adhd -d adhd -Atc "$Q")
if [ "$live" != "$rest" ]; then echo "$(date -Is) HATA: tablo sayisi canli=$live yedek=$rest"; exit 1; fi
COUNT="select table_schema||'.'||table_name||'='||(xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text from information_schema.tables where table_type='BASE TABLE' and table_schema not in ('pg_catalog','information_schema') order by 1"
docker exec navortal-db-1 psql -U adhd -d adhd -Atc "$COUNT" > /tmp/navortal-live-counts.txt
docker exec "$T" psql -U adhd -d adhd -Atc "$COUNT" > /tmp/navortal-rest-counts.txt
rows=$(wc -l < /tmp/navortal-rest-counts.txt)
echo "$(date -Is) TAMAM: $(basename "$LATEST") yuklendi, $rest tablo, satir sayisi farki (yedekten bu yana degisenler): $(diff /tmp/navortal-live-counts.txt /tmp/navortal-rest-counts.txt | grep -c '^>' || true) tablo"
