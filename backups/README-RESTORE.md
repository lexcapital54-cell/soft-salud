# Restaurar HABILISALUD en el Mac mini

Copia estos archivos al Mac mini (AirDrop, USB o carpeta del proyecto):

- `habilisalud-latest.dump` — formato personalizado (recomendado, ~42 MB)
- `habilisalud-latest.sql` — SQL plano (alternativa, ~78 MB)

También conviene copiar `api/storage/` (espejo en disco de PDFs/adjuntos).

## 1. Crear la base

```bash
# Con Homebrew Postgres
brew services start postgresql@18   # o la versión instalada
createuser -s postgres              # si no existe
createdb -U postgres habilisalud
```

## 2. Restaurar (recomendado: .dump)

```bash
export PGPASSWORD='tu_password'
pg_restore -h localhost -U postgres -d habilisalud --clean --if-exists --no-owner --no-acl \
  /ruta/a/habilisalud-latest.dump
```

## 3. Alternativa: .sql

```bash
export PGPASSWORD='tu_password'
psql -h localhost -U postgres -d habilisalud -f /ruta/a/habilisalud-latest.sql
```

## 4. Configurar API

En `api/.env` del Mac mini:

```env
DATABASE_URL=postgresql://postgres:tu_password@localhost:5432/habilisalud?schema=public
STORAGE_ROOT=/ruta/absoluta/al/proyecto/api/storage
```

Luego:

```bash
cd api
npm install
npx prisma generate
npm run build
npm run start:prod
```
