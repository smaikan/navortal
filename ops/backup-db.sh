#!/usr/bin/env bash
# Navortal veritabani yedegi: sikistirilmis pg_dump, dogrulama, en fazla 5 yedek saklama.
set -euo pipefail
umask 077
DIR=/var/backups/navortal
KEEP=5
NAME="adhd-$(date +%Y%m%d-%H%M).dump"
mkdir -p "$DIR"
log() { echo "$(date -Is) $*"; }

# Disk neredeyse doluysa yedek almak diski tamamen doldurmasin.
free_mb=$(df -Pm "$DIR" | awk 'NR==2{print $4}')
if [ "$free_mb" -lt 1024 ]; then log "HATA: bos disk ${free_mb} MB, yedek alinmadi"; exit 1; fi

docker exec navortal-db-1 pg_dump -U adhd -d adhd -Fc > "$DIR/.$NAME.tmp"
size=$(stat -c %s "$DIR/.$NAME.tmp")
if [ "$size" -lt 1024 ]; then rm -f "$DIR/.$NAME.tmp"; log "HATA: dump bos veya cok kucuk"; exit 1; fi
# Dosya okunabiliyor mu: icerik listesi cikmali.
if ! docker exec -i navortal-db-1 pg_restore --list < "$DIR/.$NAME.tmp" > /dev/null; then
  rm -f "$DIR/.$NAME.tmp"; log "HATA: dump dogrulanamadi"; exit 1
fi
mv "$DIR/.$NAME.tmp" "$DIR/$NAME"
log "TAMAM: $NAME ($((size / 1024)) KB)"

# Yalniz en yeni $KEEP yedek kalir, digerleri silinir.
ls -1t "$DIR"/adhd-*.dump | tail -n +$((KEEP + 1)) | while read -r f; do rm -f "$f"; log "silindi: $(basename "$f")"; done
