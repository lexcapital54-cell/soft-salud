-- Seguimiento longitudinal de medicina estética por paciente (mapa facial y procedimientos con trazabilidad).
CREATE TABLE IF NOT EXISTS "aesthetic_tracking" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "updated_by_name" VARCHAR(160),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "aesthetic_tracking_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "aesthetic_tracking_patient_id_key" ON "aesthetic_tracking"("patient_id");
CREATE INDEX IF NOT EXISTS "aesthetic_tracking_clinic_id_idx" ON "aesthetic_tracking"("clinic_id");

DO $$ BEGIN
  ALTER TABLE "aesthetic_tracking" ADD CONSTRAINT "aesthetic_tracking_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "aesthetic_tracking" ADD CONSTRAINT "aesthetic_tracking_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
