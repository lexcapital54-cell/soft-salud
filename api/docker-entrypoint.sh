#!/usr/bin/env sh
set -e

echo "==> Aplicando migraciones Prisma (tablas / columnas pendientes)…"
npx prisma migrate deploy

echo "==> Iniciando API NestJS…"
exec node dist/src/main.js
