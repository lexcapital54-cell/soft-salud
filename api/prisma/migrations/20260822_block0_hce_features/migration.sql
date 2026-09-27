-- Bloque 0: multi-sede, bloqueo agenda, REPS, draft logs, reportes PDF

-- CreateEnum
CREATE TYPE "appointments_event_type_enum" AS ENUM ('CITA', 'BLOQUEO');

-- AlterTable: appointments (bloqueos sin paciente)
ALTER TABLE "appointments"
  ADD COLUMN "event_type" "appointments_event_type_enum" NOT NULL DEFAULT 'CITA',
  ADD COLUMN "block_reason" VARCHAR(255);

ALTER TABLE "appointments" ALTER COLUMN "patient_id" DROP NOT NULL;

-- AlterTable: users (vencimiento REPS del profesional)
ALTER TABLE "users" ADD COLUMN "reps_expiration_date" DATE;

-- CreateTable: acceso multi-sede (Asistente / RECEPTIONIST)
CREATE TABLE "user_clinic_access" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_clinic_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_clinic_access_user_id_clinic_id_key" ON "user_clinic_access"("user_id", "clinic_id");
CREATE INDEX "user_clinic_access_clinic_id_idx" ON "user_clinic_access"("clinic_id");

ALTER TABLE "user_clinic_access" ADD CONSTRAINT "user_clinic_access_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_clinic_access" ADD CONSTRAINT "user_clinic_access_clinic_id_fkey"
  FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: auditoría autoguardado HCE
CREATE TABLE "clinical_record_draft_logs" (
    "id" UUID NOT NULL,
    "clinical_record_id" UUID NOT NULL,
    "saved_by_id" UUID,
    "content_hash" VARCHAR(128),
    "saved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_record_draft_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "clinical_record_draft_logs_clinical_record_id_saved_at_idx"
  ON "clinical_record_draft_logs"("clinical_record_id", "saved_at");

ALTER TABLE "clinical_record_draft_logs" ADD CONSTRAINT "clinical_record_draft_logs_clinical_record_id_fkey"
  FOREIGN KEY ("clinical_record_id") REFERENCES "clinical_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinical_record_draft_logs" ADD CONSTRAINT "clinical_record_draft_logs_saved_by_id_fkey"
  FOREIGN KEY ("saved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: informes clínicos exportados (PDF)
CREATE TABLE "clinical_report_exports" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "encounter_id" UUID,
    "requested_by" VARCHAR(160) NOT NULL,
    "exported_by_id" UUID NOT NULL,
    "storage_key" VARCHAR(255),
    "exported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_report_exports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "clinical_report_exports_patient_id_exported_at_idx"
  ON "clinical_report_exports"("patient_id", "exported_at");
CREATE INDEX "clinical_report_exports_clinic_id_exported_at_idx"
  ON "clinical_report_exports"("clinic_id", "exported_at");

ALTER TABLE "clinical_report_exports" ADD CONSTRAINT "clinical_report_exports_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinical_report_exports" ADD CONSTRAINT "clinical_report_exports_encounter_id_fkey"
  FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clinical_report_exports" ADD CONSTRAINT "clinical_report_exports_exported_by_id_fkey"
  FOREIGN KEY ("exported_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Índice agenda: bloqueos por profesional
CREATE INDEX "appointments_professional_id_event_type_starts_at_idx"
  ON "appointments"("professional_id", "event_type", "starts_at");
