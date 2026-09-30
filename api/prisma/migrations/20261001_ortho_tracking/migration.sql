-- Seguimiento longitudinal de ortodoncia por paciente (editable después de firmar la historia).
CREATE TABLE IF NOT EXISTS "ortho_tracking" (
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
    CONSTRAINT "ortho_tracking_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ortho_tracking_patient_id_key" ON "ortho_tracking"("patient_id");
CREATE INDEX IF NOT EXISTS "ortho_tracking_clinic_id_idx" ON "ortho_tracking"("clinic_id");

DO $$ BEGIN
  ALTER TABLE "ortho_tracking" ADD CONSTRAINT "ortho_tracking_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ortho_tracking" ADD CONSTRAINT "ortho_tracking_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
