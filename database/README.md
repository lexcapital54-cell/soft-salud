# Base de datos local (pgAdmin)

No usamos Docker. PostgreSQL corre en tu máquina y se administra con pgAdmin.

## 1. Crear la base

En pgAdmin, sobre el servidor local:

1. Clic derecho en **Databases** → **Create** → **Database**
2. Name: `habilisalud`
3. Save

También puedes ejecutar `01-create-database.sql` conectado a la base `postgres`.

## 2. Tablas

En desarrollo, **TypeORM crea las tablas** al arrancar la API (`synchronize: true`).

No hace falta correr `02-schema.sql` si la base está vacía.

`02-schema.sql` queda como referencia del modelo:

- `clinics` — consultorios (Psicología, Odontología, Medicina, Medicina estética)
- `users` — `SUPER_ADMIN` o `CLINIC_ADMIN`

## 3. Credenciales de conexión

Edita `api/.env` con el usuario y contraseña de tu Postgres local (los mismos de pgAdmin):

```
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=tu_password
DB_NAME=habilisalud
```
