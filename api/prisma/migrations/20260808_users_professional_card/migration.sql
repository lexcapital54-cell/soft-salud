-- Añade professional_card a users (requerido por Prisma User / HCE)

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "professional_card" VARCHAR(80);
