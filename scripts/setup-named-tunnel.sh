#!/usr/bin/env bash
# Configura un túnel Cloudflare CON NOMBRE (URL fija).
# Así la landing en Latinoamérica Hosting apunta siempre a
# https://app.habilisalud.com y NO hay que volver a subir dist/ cada reinicio.
#
# Requisitos:
#   1. Dominio habilisalud.com (o el tuyo) en Cloudflare DNS
#   2. cloudflared instalado (brew install cloudflared)
#
# Uso:
#   ./scripts/setup-named-tunnel.sh
#   ./scripts/setup-named-tunnel.sh app.midominio.com
#
set -euo pipefail

HOSTNAME="${1:-app.habilisalud.com}"
TUNNEL_NAME="${TUNNEL_NAME:-habilisalud-mac}"
CF_DIR="${HOME}/.cloudflared"
CONFIG="${CF_DIR}/config.yml"

echo "=============================================="
echo " Túnel fijo → https://${HOSTNAME}"
echo "=============================================="
echo ""
echo "Esto se hace UNA vez. Después:"
echo "  - La landing del hosting siempre apunta a https://${HOSTNAME}"
echo "  - Al mover el Mac mini solo corres: ./scripts/start-all.sh"
echo "  - Ya no subes zip al cPanel por cada reinicio"
echo ""

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Instala cloudflared: brew install cloudflare/cloudflare/cloudflared"
  exit 1
fi

mkdir -p "$CF_DIR"

if [[ ! -f "${CF_DIR}/cert.pem" ]]; then
  echo "==> Paso 1/4: login en Cloudflare (se abre el navegador)…"
  echo "    Elige el dominio donde vive ${HOSTNAME} (ej. habilisalud.com)."
  cloudflared tunnel login
else
  echo "==> cert.pem ya existe (login previo OK)"
fi

EXISTING="$(cloudflared tunnel list 2>/dev/null | awk -v n="$TUNNEL_NAME" '$1==n || $2==n {print; found=1} END{exit !found}' || true)"
if [[ -z "$EXISTING" ]]; then
  echo "==> Paso 2/4: creando túnel «${TUNNEL_NAME}»…"
  cloudflared tunnel create "$TUNNEL_NAME"
else
  echo "==> Túnel «${TUNNEL_NAME}» ya existe"
  echo "$EXISTING"
fi

# UUID del túnel
TUNNEL_ID="$(cloudflared tunnel list | awk -v n="$TUNNEL_NAME" '$2==n {print $1; exit}')"
if [[ -z "$TUNNEL_ID" ]]; then
  # formato alterno: NAME en col 1
  TUNNEL_ID="$(cloudflared tunnel list | awk -v n="$TUNNEL_NAME" '$1==n {print $2; exit}')"
fi
if [[ -z "$TUNNEL_ID" ]]; then
  echo "No pude leer el UUID del túnel. Salida de cloudflared tunnel list:"
  cloudflared tunnel list
  exit 1
fi

CREDS="${CF_DIR}/${TUNNEL_ID}.json"
if [[ ! -f "$CREDS" ]]; then
  echo "No encontré credenciales en $CREDS"
  ls -la "$CF_DIR"
  exit 1
fi

echo "==> Paso 3/4: escribiendo ${CONFIG}"
cat >"$CONFIG" <<EOF
# Generado por scripts/setup-named-tunnel.sh — no subir a git.
tunnel: ${TUNNEL_ID}
credentials-file: ${CREDS}

ingress:
  - hostname: ${HOSTNAME}
    service: http://localhost:8080
  - service: http_status:404
EOF
ok_config() { echo "    ✓ $CONFIG"; }
ok_config

echo "==> Paso 4/4: DNS CNAME en Cloudflare"
cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME" || {
  echo ""
  echo "Si falló el DNS automático, créalo a mano en Cloudflare → DNS:"
  echo "  Tipo: CNAME"
  echo "  Nombre: ${HOSTNAME%%.*}   (ej. app)"
  echo "  Destino: ${TUNNEL_ID}.cfargotunnel.com"
  echo "  Proxy: ON (nube naranja)"
}

echo ""
echo "=============================================="
echo " Listo. Próximos pasos:"
echo "=============================================="
echo "1. En este Mac:  ./scripts/start-all.sh"
echo "   (usará el túnel fijo, no trycloudflare)"
echo ""
echo "2. UNA sola vez — rebuild landing y subir a cPanel:"
echo "   VITE_ADMIN_URL=https://${HOSTNAME} npm run build"
echo "   # zip dist/ → public_html"
echo ""
echo "3. Cuando muevan el Mac al sitio final:"
echo "   - Internet + Docker + Postgres"
echo "   - ./scripts/start-all.sh"
echo "   - La web del hosting sigue igual (no re-subir)"
echo ""
