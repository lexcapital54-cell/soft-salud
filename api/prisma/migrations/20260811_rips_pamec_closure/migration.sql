-- Cierre arquitectónico: variables RIPS en Patient, trazabilidad PAMEC en Appointment (idempotente)
-- Res. 3100 de 2019 · Res. 2275 de 2023 · Ley 1581 de 2012

-- ─── 1) Enums RIPS ───────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "patients_user_type_enum" AS ENUM ('PARTICULAR', 'CONTRIBUTIVO', 'SUBSIDIADO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "patients_residence_zone_enum" AS ENUM ('URBANA', 'RURAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 2) Variables RIPS en patients ───────────────────────────────────────────
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "user_type" "patients_user_type_enum";
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "residence_zone" "patients_residence_zone_enum";
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "municipality_code" VARCHAR(5);

-- Backfill de user_type desde el campo legacy regime (texto libre de la ficha)
UPDATE "patients"
SET "user_type" = CASE
  WHEN upper(btrim("regime")) LIKE 'CONTRIBUTIV%' THEN 'CONTRIBUTIVO'::"patients_user_type_enum"
  WHEN upper(btrim("regime")) LIKE 'SUBSIDIAD%'   THEN 'SUBSIDIADO'::"patients_user_type_enum"
  WHEN upper(btrim("regime")) LIKE 'PARTICULAR%'  THEN 'PARTICULAR'::"patients_user_type_enum"
  ELSE NULL
END
WHERE "user_type" IS NULL AND "regime" IS NOT NULL;

-- ─── 3) Trazabilidad PAMEC / telemedicina en appointments ────────────────────
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "request_date" TIMESTAMPTZ(6);
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "meeting_url" TEXT;

-- Sin dato histórico de solicitud, created_at es la mejor aproximación disponible
UPDATE "appointments"
SET "request_date" = "created_at"
WHERE "request_date" IS NULL;

-- ─── 4) Índice para la agenda del día ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "appointments_clinic_id_status_starts_at_idx"
  ON "appointments" ("clinic_id", "status", "starts_at");
