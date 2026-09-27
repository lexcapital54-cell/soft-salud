-- Contraseña en claro solo para consulta del SUPER_ADMIN (última asignada/reseteada).
-- El hash bcrypt sigue siendo el usado para autenticación.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "password_reminder" VARCHAR(72);
