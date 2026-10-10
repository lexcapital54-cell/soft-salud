-- Personal de agenda sin cuenta (asistentes de estética corporal) y cita asignada a una asistente.
CREATE TABLE IF NOT EXISTS "agenda_staff" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "role_label" VARCHAR(120) NOT NULL DEFAULT 'Estética corporal',
    "shift_start" VARCHAR(5) NOT NULL DEFAULT '08:00',
    "shift_end" VARCHAR(5) NOT NULL DEFAULT '18:00',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "agenda_staff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agenda_staff_clinic_id_name_key" ON "agenda_staff"("clinic_id", "name");
CREATE INDEX IF NOT EXISTS "agenda_staff_clinic_id_active_idx" ON "agenda_staff"("clinic_id", "active");

DO $$ BEGIN
  ALTER TABLE "agenda_staff" ADD CONSTRAINT "agenda_staff_clinic_id_fkey"
    FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "staff_id" UUID;
CREATE INDEX IF NOT EXISTS "appointments_staff_id_starts_at_idx" ON "appointments"("staff_id", "starts_at");

DO $$ BEGIN
  ALTER TABLE "appointments" ADD CONSTRAINT "appointments_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "agenda_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
