# Despliegue Mac mini M4 — HABILISALUD

Landing en Latinoamérica Hosting. Admin (Angular) + API (Nest) + Postgres en este Mac.

## Arquitectura

```
www.habilisalud.com     → hosting (landing Vite)
app.habilisalud.com     → Cloudflare Tunnel → http://localhost:8080 (Caddy)
                              ├─ /        Angular admin
                              └─ /api/*   NestJS (contenedor api:3000)
Postgres                → host Mac (puerto 5432, fuera de Docker)
```

Botones de la landing:

| Botón | URL |
|-------|-----|
| Ingreso del profesional | `https://app.…/login?tipo=profesional` |
| Iniciar sesión (superadmin) | `https://app.…/login?tipo=admin` |

## 1. Requisitos en el Mac

- Docker Desktop encendido
- PostgreSQL local con base `habilisalud` restaurada
- `api/.env` con usuario/clave correctos (hoy: `postgres` / `root`)

## 2. Arranque rápido (recomendado)

Después de cerrar Docker o reiniciar el Mac, un solo comando:

```bash
./scripts/start-all.sh
```

Eso hace, en orden:

1. Abre Docker Desktop si hace falta  
2. Arranca PostgreSQL del Mac (`brew services`)  
3. Levanta `api` + `web` y espera a que estén sanos  
4. Abre el túnel Cloudflare (fijo si ya corriste `setup-named-tunnel.sh`)

Solo local (sin Internet):

```bash
./scripts/start-all.sh --no-tunnel
```

### Evitar re-subir al cPanel (producción)

El quick tunnel (`*.trycloudflare.com`) **cambia de URL** cada reinicio → obliga a rebuild + subir la landing.

Solución: **túnel con nombre + dominio fijo** (una sola vez):

```bash
./scripts/setup-named-tunnel.sh
# (login en el navegador, elige el dominio en Cloudflare)
```

Luego **una sola subida** de la landing:

```bash
VITE_ADMIN_URL=https://app.habilisalud.com npm run build
# sube el contenido de dist/ a public_html
```

Cuando muevan el Mac al sitio final: Internet + `./scripts/start-all.sh`.  
La web del hosting **no se toca** otra vez.

Parar:

```bash
./scripts/stop-all.sh
```

## 3. Levantar admin + API a mano

Desde la raíz del repo:

```bash
docker compose up -d --build
```

Comprobar:

- Admin: http://localhost:8080/login
- API vía proxy: http://localhost:8080/api
- API directa: http://localhost:3000/api

Logs:

```bash
docker compose logs -f api web
```

Parar:

```bash
docker compose down
```

## 4. Exponer al mundo (Cloudflare Tunnel)

### Opción A — acceso inmediato (quick tunnel)

Con Docker arriba en `:8080` (o usa `./scripts/start-all.sh` que ya lo incluye):

```bash
brew install cloudflared   # ya instalado en el Mac mini
./scripts/start-public-tunnel.sh
```

Te da una URL `https://….trycloudflare.com`. Úsala ya para entrar al admin desde cualquier lugar.
La URL **cambia** cada vez que reinicias el túnel.

Rebuild de la landing con esa URL:

```bash
VITE_ADMIN_URL='https://TU-URL.trycloudflare.com' npm run build
# sube dist/ a Latinoamérica Hosting
```

### Opción B — dominio fijo `app.habilisalud.com` (producción)

1. Dominio en Cloudflare (p. ej. `habilisalud.com`).
2. Login y túnel con nombre:

```bash
cloudflared tunnel login
cloudflared tunnel create habilisalud-mac
```

3. Configurar `~/.cloudflared/config.yml` (ajusta el UUID del túnel):

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /Users/danielquintero/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: app.habilisalud.com
    service: http://localhost:8080
  - service: http_status:404
```

4. DNS en Cloudflare: CNAME `app` → `<TUNNEL_UUID>.cfargotunnel.com` (proxied).

5. Arrancar túnel (y dejarlo al login):

```bash
cloudflared tunnel run habilisalud-mac
# o servicio:
sudo cloudflared service install
```

Luego:

```bash
VITE_ADMIN_URL=https://app.habilisalud.com npm run build
```

## 4. Actualizar la landing en el hosting

Rebuild apuntando al admin público:

```bash
VITE_ADMIN_URL=https://app.habilisalud.com npm run build
```

Sube el contenido de `dist/` a Latinoamérica Hosting (public_html).

Los botones verde y “Iniciar sesión” irán a tu Mac.

## 5. Mac siempre disponible

- Desactivar suspensión o “evitar suspensión con pantalla apagada” mientras sirva.
- Docker Desktop → Settings → “Start Docker Desktop when you log in”.
- Túnel Cloudflare como servicio o `launchd`.

## 6. Seguridad

- Cambia `JWT_SECRET` y `SUPERADMIN_PASSWORD` en `api/.env` antes de producción real.
- No publiques el puerto 5432 a Internet.
- Preferible solo túnel (8080 en localhost); no hace falta abrir el router.

## Solución de problemas

| Síntoma | Qué revisar |
|---------|-------------|
| API no conecta a BD | Postgres arriba; `host.docker.internal:5432`; user/pass en compose |
| `/api` 502 | `docker compose logs api` |
| Login OK en local pero no desde celular | Túnel / DNS `app.` |
| Botones van a localhost o Netlify | Rebuild landing con `VITE_ADMIN_URL` y volver a subir |
