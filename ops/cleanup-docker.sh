#!/usr/bin/env bash
# Haftalik: bir haftadan eski derleme onbellegi ve etiketsiz imajlar. Etiketli geri donus imajlari ve volume'lara dokunmaz.
set -e
docker builder prune -f --filter until=168h > /dev/null
docker image prune -f > /dev/null
echo "$(date -Is) temizlik tamam, disk %$(df -P / | awk 'NR==2{gsub("%","",$5);print $5}')"
