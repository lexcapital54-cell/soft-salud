#!/bin/bash
# Instala el respaldo automático de HABILISALUD en este Mac (LaunchAgent).
# Corre todos los días a la 1:00 y a las 13:00 (si el Mac estaba dormido, al despertar).
# Uso: bash scripts/install-backup.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="$HOME/.habilisalud"
LABEL="com.habilisalud.respaldo"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$TARGET_DIR" "$HOME/HabilisaludRespaldos/logs" "$HOME/Library/LaunchAgents"
# Copia fuera del Escritorio: launchd no siempre tiene permiso para leerlo.
cp "$HERE/backup-habilisalud.sh" "$TARGET_DIR/backup-habilisalud.sh"
chmod 700 "$TARGET_DIR/backup-habilisalud.sh"

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$TARGET_DIR/backup-habilisalud.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>1</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>13</integer><key>Minute</key><integer>0</integer></dict>
  </array>
  <key>StandardOutPath</key><string>$HOME/HabilisaludRespaldos/logs/launchd.log</string>
  <key>StandardErrorPath</key><string>$HOME/HabilisaludRespaldos/logs/launchd.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Respaldo programado ($LABEL). Ejecutar ahora: launchctl kickstart gui/$(id -u)/$LABEL"
