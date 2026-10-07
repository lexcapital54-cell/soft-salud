-- Logo propio de los formatos administrativos (independiente del de la historia clínica).
ALTER TYPE "ClinicLogoKind" ADD VALUE IF NOT EXISTS 'FORMS';

-- Formato PSI-ADM-01 «Control de citas y asistencia» (administrativo, sin contenido clínico).
CREATE TABLE IF NOT EXISTS "attendance_controls" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "patient_id" UUID,
  "patient_name" VARCHAR(160) NOT NULL,
  "data" JSONB NOT NULL,
  "created_by_id" UUID NOT NULL,
  "updated_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "attendance_controls_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_controls_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "attendance_controls_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "attendance_controls_clinic_id_updated_at_idx" ON "attendance_controls"("clinic_id", "updated_at");
CREATE INDEX IF NOT EXISTS "attendance_controls_patient_id_idx" ON "attendance_controls"("patient_id");
