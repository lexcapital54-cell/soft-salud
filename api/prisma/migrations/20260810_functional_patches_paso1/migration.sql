-- Parches Funcionales Paso 1: RBAC, visitType/SOAP, Prescription/Incapacity/IUM, multimedia, SIVIGILA (idempotente)

-- ─── 1) UserRole renames + AUDITOR ───────────────────────────────────────────
DO $$ BEGIN
  ALTER TYPE "users_role_enum" RENAME VALUE 'CLINIC_ADMIN' TO 'ADMIN';
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN invalid_parameter_value THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "users_role_enum" RENAME VALUE 'PROFESSIONAL' TO 'HEALTH_PROFESSIONAL';
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN invalid_parameter_value THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "users_role_enum" RENAME VALUE 'RECEPTION' TO 'RECEPTIONIST';
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN invalid_parameter_value THEN NULL;
END $$;

-- Si la instalación nunca tuvo PROFESSIONAL/RECEPTION (solo SUPER_ADMIN/CLINIC_ADMIN), crearlos
DO $$ BEGIN
  ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'HEALTH_PROFESSIONAL';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'RECEPTIONIST';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'AUDITOR';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── 2) Enums nuevos ─────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "VisitType" AS ENUM ('INITIAL', 'FOLLOW_UP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ClinicalNoteFormat" AS ENUM ('FULL', 'SOAP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PrescriptionKind" AS ENUM ('MEDICATION', 'MEDICAL_ORDER', 'REFERRAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ClinicalDocumentStatus" AS ENUM ('DRAFT', 'SIGNED', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AttachmentCategory: nuevos valores (PHOTO, DRAWING, EVOLUTION_MEDIA)
DO $$ BEGIN
  ALTER TYPE "AttachmentCategory" ADD VALUE IF NOT EXISTS 'PHOTO';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE "AttachmentCategory" ADD VALUE IF NOT EXISTS 'DRAWING';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE "AttachmentCategory" ADD VALUE IF NOT EXISTS 'EVOLUTION_MEDIA';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 3) Encounter: visitType ─────────────────────────────────────────────────
ALTER TABLE "encounters" ADD COLUMN IF NOT EXISTS "visit_type" "VisitType";
ALTER TABLE "encounters" ADD COLUMN IF NOT EXISTS "visit_type_reason" VARCHAR(120);
ALTER TABLE "encounters" ADD COLUMN IF NOT EXISTS "specialty_snapshot" "clinics_specialty_enum";

-- ─── 4) ClinicalRecord: noteFormat ───────────────────────────────────────────
ALTER TABLE "clinical_records" ADD COLUMN IF NOT EXISTS "note_format" "ClinicalNoteFormat";
UPDATE "clinical_records" SET "note_format" = 'FULL' WHERE "note_format" IS NULL;
ALTER TABLE "clinical_records" ALTER COLUMN "note_format" SET DEFAULT 'FULL';
ALTER TABLE "clinical_records" ALTER COLUMN "note_format" SET NOT NULL;

-- ─── 5) ClinicalAttachment: multimedia fields ────────────────────────────────
ALTER TABLE "clinical_attachments" ADD COLUMN IF NOT EXISTS "clinical_record_id" UUID;
ALTER TABLE "clinical_attachments" ADD COLUMN IF NOT EXISTS "caption" VARCHAR(255);
ALTER TABLE "clinical_attachments" ADD COLUMN IF NOT EXISTS "notes" TEXT;

DO $$ BEGIN
  ALTER TABLE "clinical_attachments"
    ADD CONSTRAINT "clinical_attachments_clinical_record_id_fkey"
    FOREIGN KEY ("clinical_record_id") REFERENCES "clinical_records"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "clinical_attachments_clinical_record_id_idx"
  ON "clinical_attachments" ("clinical_record_id");

-- ─── 6) CieCode: SIVIGILA ────────────────────────────────────────────────────
ALTER TABLE "cie_codes" ADD COLUMN IF NOT EXISTS "sivigila_notifiable" BOOLEAN;
UPDATE "cie_codes" SET "sivigila_notifiable" = false WHERE "sivigila_notifiable" IS NULL;
ALTER TABLE "cie_codes" ALTER COLUMN "sivigila_notifiable" SET DEFAULT false;
ALTER TABLE "cie_codes" ALTER COLUMN "sivigila_notifiable" SET NOT NULL;
ALTER TABLE "cie_codes" ADD COLUMN IF NOT EXISTS "sivigila_event_code" VARCHAR(20);

CREATE INDEX IF NOT EXISTS "cie_codes_sivigila_notifiable_idx"
  ON "cie_codes" ("sivigila_notifiable");

-- ─── 7) IUM / Prescription / Incapacity ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ium_medications" (
  "id" UUID NOT NULL,
  "ium_code" VARCHAR(40) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "active_ingredient" VARCHAR(255),
  "pharmaceutical_form" VARCHAR(120),
  "concentration" VARCHAR(80),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ium_medications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ium_medications_ium_code_key" ON "ium_medications" ("ium_code");
CREATE INDEX IF NOT EXISTS "ium_medications_name_idx" ON "ium_medications" ("name");

CREATE TABLE IF NOT EXISTS "prescriptions" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "encounter_id" UUID NOT NULL,
  "patient_id" UUID NOT NULL,
  "author_id" UUID NOT NULL,
  "kind" "PrescriptionKind" NOT NULL DEFAULT 'MEDICATION',
  "status" "ClinicalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
  "diagnosis_cie" VARCHAR(20),
  "notes" TEXT,
  "signature_base64" TEXT,
  "signed_at" TIMESTAMPTZ(6),
  "pdf_storage_key" TEXT,
  "content_hash" VARCHAR(128),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "prescriptions"
    ADD CONSTRAINT "prescriptions_clinic_id_fkey"
    FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "prescriptions"
    ADD CONSTRAINT "prescriptions_encounter_id_fkey"
    FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "prescriptions"
    ADD CONSTRAINT "prescriptions_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "prescriptions"
    ADD CONSTRAINT "prescriptions_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "prescriptions_encounter_id_idx" ON "prescriptions" ("encounter_id");
CREATE INDEX IF NOT EXISTS "prescriptions_clinic_id_signed_at_idx" ON "prescriptions" ("clinic_id", "signed_at");

CREATE TABLE IF NOT EXISTS "prescription_items" (
  "id" UUID NOT NULL,
  "prescription_id" UUID NOT NULL,
  "ium_medication_id" UUID,
  "free_text_name" VARCHAR(255),
  "dose" VARCHAR(80),
  "frequency" VARCHAR(120),
  "duration" VARCHAR(80),
  "quantity" VARCHAR(40),
  "route" VARCHAR(60),
  "instructions" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "prescription_items"
    ADD CONSTRAINT "prescription_items_prescription_id_fkey"
    FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "prescription_items"
    ADD CONSTRAINT "prescription_items_ium_medication_id_fkey"
    FOREIGN KEY ("ium_medication_id") REFERENCES "ium_medications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "prescription_items_prescription_id_idx"
  ON "prescription_items" ("prescription_id");

CREATE TABLE IF NOT EXISTS "incapacities" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "encounter_id" UUID NOT NULL,
  "patient_id" UUID NOT NULL,
  "author_id" UUID NOT NULL,
  "status" "ClinicalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "days" INTEGER NOT NULL,
  "diagnosis_cie" VARCHAR(20),
  "cause" VARCHAR(160),
  "observations" TEXT,
  "signature_base64" TEXT,
  "signed_at" TIMESTAMPTZ(6),
  "pdf_storage_key" TEXT,
  "content_hash" VARCHAR(128),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "incapacities_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "incapacities"
    ADD CONSTRAINT "incapacities_clinic_id_fkey"
    FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "incapacities"
    ADD CONSTRAINT "incapacities_encounter_id_fkey"
    FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "incapacities"
    ADD CONSTRAINT "incapacities_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "incapacities"
    ADD CONSTRAINT "incapacities_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "incapacities_encounter_id_idx" ON "incapacities" ("encounter_id");
CREATE INDEX IF NOT EXISTS "incapacities_clinic_id_start_date_idx" ON "incapacities" ("clinic_id", "start_date");
