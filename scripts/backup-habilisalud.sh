#!/bin/bash
# Respaldo de HABILISALUD: base de datos (incluye los archivos guardados en
# `stored_files`) + carpeta de archivos de los consultorios (`/app/storage`).
#
# Destinos:
#   - Disco externo (si está conectado): /Volumes/Empresarial/HabilisaludRespaldos
#   - Copia local corta: ~/HabilisaludRespaldos
#
# Nunca borra archivos de los consultorios: lo que cambie o se elimine en el
# servidor se guarda en storage/cambios/<fecha> antes de actualizar el espejo.
#
# Instalación y programación: scripts/install-backup.sh
set -uo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Applications/Docker.app/Contents/Resources/bin"

EXTERNAL_ROOT="${HABILISALUD_BACKUP_EXTERNAL:-/Volumes/Empresarial/HabilisaludRespaldos}"
LOCAL_ROOT="${HABILISALUD_BACKUP_LOCAL:-$HOME/HabilisaludRespaldos}"
DB_NAME="${HABILISALUD_DB_NAME:-habilisalud}"
DB_HOST="${HABILISALUD_DB_HOST:-localhost}"
DB_USER="${HABILISALUD_DB_USER:-postgres}"
export PGPASSWORD="${HABILISALUD_DB_PASSWORD:-root}"
API_CONTAINER="${HABILISALUD_API_CONTAINER:-habilisalud-api}"

# Retención: días de copias de base de datos y de cambios de archivos.
EXTERNAL_DB_DAYS=60
LOCAL_DB_DAYS=7
CHANGES_DAYS=180

STAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$LOCAL_ROOT/logs"
LOG="$LOCAL_ROOT/logs/respaldo_$(date +%Y%m).log"
exec >>"$LOG" 2>&1

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
fail=0

log "=== Inicio respaldo $STAMP ==="

TMP="$(mktemp -d "${TMPDIR:-/tmp}/habilisalud-respaldo.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# 1) Base de datos (formato custom, comprimido) y verificación de lectura.
DUMP="$TMP/habilisalud_$STAMP.dump"
if pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -Fc -Z 6 -f "$DUMP"; then
  if pg_restore --list "$DUMP" >/dev/null; then
    log "Base de datos: $(du -h "$DUMP" | cut -f1) verificada"
  else
    log "ERROR: la copia de la base no se pudo verificar"
    fail=1
  fi
else
  log "ERROR: pg_dump falló"
  fail=1
fi

# 2) Archivos de los consultorios, leídos desde el contenedor de la API.
STORAGE_TMP="$TMP/storage"
if docker cp "$API_CONTAINER:/app/storage/." "$STORAGE_TMP" >/dev/null; then
  log "Archivos: $(find "$STORAGE_TMP" -type f | wc -l | tr -d ' ') archivos ($(du -sh "$STORAGE_TMP" | cut -f1))"
else
  log "ERROR: no se pudieron leer los archivos del contenedor $API_CONTAINER"
  STORAGE_TMP=""
  fail=1
fi

# 2b) Paquetes maestros de documentación por especialidad (montados en la API).
PACKS_TMP="$TMP/paquetes"
mkdir -p "$PACKS_TMP"
packs_ok=0
for pair in "habilitation-pack:psicologia" "habilitation-packs/fisioterapia:fisioterapia" \
  "habilitation-packs/odontologia:odontologia" "habilitation-packs/estetica:estetica"; do
  src="${pair%%:*}" name="${pair##*:}"
  if docker exec "$API_CONTAINER" test -d "/app/$src"; then
    docker cp "$API_CONTAINER:/app/$src/." "$PACKS_TMP/$name" >/dev/null && packs_ok=$((packs_ok + 1))
  fi
done
if [ "$packs_ok" -gt 0 ]; then
  log "Paquetes maestros: $packs_ok ($(du -sh "$PACKS_TMP" | cut -f1))"
else
  log "AVISO: no se encontraron paquetes maestros en $API_CONTAINER"
  PACKS_TMP=""
fi

save_to() {
  local root="$1" db_days="$2" label="$3"
  mkdir -p "$root/db" "$root/storage/actual" "$root/storage/cambios" || return 1
  if [ -n "$PACKS_TMP" ]; then
    mkdir -p "$root/paquetes/actual" "$root/paquetes/cambios" || return 1
    rsync -a --delete --backup --backup-dir="$root/paquetes/cambios/$STAMP" \
      "$PACKS_TMP/" "$root/paquetes/actual/" || return 1
    find "$root/paquetes/cambios" -mindepth 1 -maxdepth 1 -type d -mtime +"$CHANGES_DAYS" -exec rm -rf {} +
  fi
  if [ -s "$DUMP" ]; then
    cp "$DUMP" "$root/db/" || return 1
    (cd "$root/db" && shasum -a 256 "habilisalud_$STAMP.dump" >"habilisalud_$STAMP.dump.sha256")
    ln -sfn "habilisalud_$STAMP.dump" "$root/db/habilisalud-ultimo.dump"
    find "$root/db" -name 'habilisalud_*.dump*' -type f -mtime +"$db_days" -delete
  fi
  if [ -n "$STORAGE_TMP" ]; then
    rsync -a --delete --backup --backup-dir="$root/storage/cambios/$STAMP" \
      "$STORAGE_TMP/" "$root/storage/actual/" || return 1
    find "$root/storage/cambios" -mindepth 1 -maxdepth 1 -type d -mtime +"$CHANGES_DAYS" -exec rm -rf {} +
  fi
  log "$label: copia guardada en $root"
}

# 3) Copia local (también sirve de origen para el disco externo).
save_to "$LOCAL_ROOT" "$LOCAL_DB_DAYS" "Local" || { log "ERROR: falló la copia local"; fail=1; }

# 4) Disco externo. Se escribe a través de Docker porque macOS no deja que
#    launchd escriba en discos externos sin acceso total al disco.
#    Solo agrega o actualiza: nunca borra lo que ya está en el disco externo.
EXTERNAL_VOLUME="$(dirname "$EXTERNAL_ROOT")"
if [ -d "$EXTERNAL_VOLUME" ]; then
  if ! docker image inspect habilisalud-rsync >/dev/null 2>&1; then
    printf 'FROM alpine:3\nRUN apk add --no-cache rsync\n' | docker build -q -t habilisalud-rsync - >/dev/null
  fi
  if docker run --rm \
    -v "$LOCAL_ROOT:/src:ro" \
    -v "$EXTERNAL_VOLUME:/vol" \
    habilisalud-rsync sh -c "
      set -e
      dst=/vol/$(basename "$EXTERNAL_ROOT")
      mkdir -p \$dst
      rsync -a /src/db /src/storage \$dst/
      if [ -d /src/paquetes ]; then rsync -a /src/paquetes \$dst/; fi
      find \$dst/db -name 'habilisalud_*.dump*' -type f -mtime +$EXTERNAL_DB_DAYS -delete
      find \$dst/storage/cambios -mindepth 1 -maxdepth 1 -type d -mtime +$CHANGES_DAYS -exec rm -rf {} +
      if [ -d \$dst/paquetes/cambios ]; then find \$dst/paquetes/cambios -mindepth 1 -maxdepth 1 -type d -mtime +$CHANGES_DAYS -exec rm -rf {} +; fi
    "; then
    log "Disco externo: copia guardada en $EXTERNAL_ROOT"
  else
    log "ERROR: falló la copia al disco externo"
    fail=1
  fi
else
  log "AVISO: el disco externo no está conectado ($EXTERNAL_VOLUME); solo se guardó la copia local"
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  log "=== Respaldo completo ==="
  date '+%Y-%m-%d %H:%M:%S' >"$LOCAL_ROOT/ULTIMO_RESPALDO_OK.txt"
else
  log "=== Respaldo con errores: revisar arriba ==="
  osascript -e 'display notification "Revise ~/HabilisaludRespaldos/logs" with title "HABILISALUD: respaldo con errores"' >/dev/null 2>&1 || true
fi
exit "$fail"
