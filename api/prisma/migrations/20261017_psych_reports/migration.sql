-- Informe psicológico (plantilla editable). La firma es opcional y la carga el profesional.
CREATE TABLE IF NOT EXISTS "psych_reports" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "patient_id" UUID,
  "patient_name" VARCHAR(160) NOT NULL,
  "report_number" VARCHAR(40) NOT NULL DEFAULT '',
  "data" JSONB NOT NULL,
  "signature_data" BYTEA,
  "signature_mime" VARCHAR(20),
  "created_by_id" UUID NOT NULL,
  "updated_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "psych_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "psych_reports_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "psych_reports_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "psych_reports_clinic_id_updated_at_idx" ON "psych_reports"("clinic_id", "updated_at");
CREATE INDEX IF NOT EXISTS "psych_reports_patient_id_idx" ON "psych_reports"("patient_id");
