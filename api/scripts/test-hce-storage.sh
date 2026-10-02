#!/usr/bin/env bash
# Prueba de almacenamiento de la HCE en una base Postgres desechable (nunca producción).
set -euo pipefail
cd "$(dirname "$0")/.."

NAME=habilisalud-test-db
PORT=${TEST_DB_PORT:-55432}
export TEST_DATABASE_URL="postgresql://postgres:test@127.0.0.1:${PORT}/habilisalud_test"

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test -e POSTGRES_DB=habilisalud_test \
  -p "127.0.0.1:${PORT}:5432" --tmpfs /var/lib/postgresql/data postgres:16-alpine >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 30); do
  docker exec "$NAME" pg_isready -U postgres -d habilisalud_test >/dev/null 2>&1 && break
  sleep 1
done

DATABASE_URL="$TEST_DATABASE_URL" npx prisma db push --skip-generate --accept-data-loss >/dev/null
# Las tablas que maneja TypeORM esperan que la base genere id y fechas (como en producción).
docker exec -i "$NAME" psql -q -U postgres -d habilisalud_test <<'SQL'
ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE users ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE clinics ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE clinics ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE user_clinic_access ALTER COLUMN id SET DEFAULT gen_random_uuid();
SQL
npx jest --config ./test/jest-e2e.json --runInBand test/hce-storage.e2e-spec.ts "$@"
