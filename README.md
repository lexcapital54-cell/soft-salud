# HABILISALUD

Landing, API NestJS y dashboard Angular. PostgreSQL local (pgAdmin), sin Docker.

## Estructura

- `/` landing (React + Vite)
- `/api` backend NestJS + Prisma (`api/prisma/schema.prisma`)
- `/admin` dashboard Angular
- `/database` scripts SQL de referencia
- `/docs/ARCHITECTURE_MVP.md` arquitectura MVP (agenda, HCE/RDA, documental)

Variables Prisma/storage en `api/.env.example`: `DATABASE_URL`, `STORAGE_ROOT`.

## 1. Base de datos (pgAdmin)

Crea la base `habilisalud` en pgAdmin. Ver `database/README.md`.

Ajusta `api/.env` con tu usuario y contraseña de Postgres.

Tras crear la BD, aplica tablas clínicas/ERP y seed:

```bash
cd api
# migraciones idempotentes en api/prisma/migrations/
npm run prisma:generate
npm run prisma:seed   # CIE/CUPS + requisitos documentales
```

## 2. API

```bash
cd api
npm install
npm run start:dev
```

Al arrancar se crea el superadmin si no existe:

- Correo: `dankojimenez@habilisalud.com`
- Contraseña: `HabiliSalud2026!`

## 3. Dashboard admin

Desarrollo:

```bash
cd admin
npm install
npm start
```

Abre [http://localhost:4200/login](http://localhost:4200/login).

Producción en este Mac (Docker: Angular + Nest, Postgres local):

```bash
docker compose up -d --build
```

Abre [http://localhost:8080/login](http://localhost:8080/login). Guía completa: [`docs/MAC_MINI_DEPLOY.md`](docs/MAC_MINI_DEPLOY.md).

El superadmin entra a **Administración**, crea consultorios (4 especialidades) y usuarios admin.

## 4. Landing

```bash
npm install
npm run dev
```

**Iniciar sesión** abre el dashboard Angular.

## Flujo

1. Superadmin inicia sesión.
2. Crea un consultorio (Psicología, Odontología, Medicina o Medicina estética).
3. Crea el usuario admin de ese consultorio.
4. Ese admin entra a su dashboard de especialidad.
