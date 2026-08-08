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

Tras crear la BD, aplica tablas clínicas y seed (Paso 2):

```bash
cd api
# si aún no están las tablas clínicas:
# node -e "..." o reutiliza prisma/migrations/20260808_paso2_clinical_tables/migration.sql
npm run prisma:seed
```

El seed carga CIE/CUPS de psicología (MVP) y requisitos del Excel `Checklist_Habilitacion_Consultorio_Psicologico_Base2.xlsx`.

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

```bash
cd admin
npm install
npm start
```

Abre [http://localhost:4200/login](http://localhost:4200/login).

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
