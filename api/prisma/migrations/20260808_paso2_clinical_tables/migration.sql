-- Paso 2: tablas clínicas Prisma (coexistencia con TypeORM clinics/users)
-- No renombra PK/defaults de clinics/users (rompe TypeORM).

-- Extensiones de users (Prisma)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "professional_card" VARCHAR(80);

-- Enums clínicos nuevos
DO $$ BEGIN
  CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'IN_WAITING', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "EncounterStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ClinicalRecordStatus" AS ENUM ('DRAFT', 'SIGNED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CareModality" AS ENUM ('IN_PERSON', 'VIRTUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DiagnosisType" AS ENUM ('PRINCIPAL', 'RELATED', 'IMPRESSION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RdaExportStatus" AS ENUM ('PENDING', 'GENERATED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'VIEW', 'EXPORT', 'UPLOAD', 'DOWNLOAD', 'SIGN', 'CLOSE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "patients" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "document_type" VARCHAR(20) NOT NULL,
    "document_number" VARCHAR(40) NOT NULL,
    "first_name" VARCHAR(80) NOT NULL,
    "middle_name" VARCHAR(80),
    "last_name" VARCHAR(80) NOT NULL,
    "second_last_name" VARCHAR(80),
    "birth_date" DATE NOT NULL,
    "sex_at_birth" VARCHAR(30),
    "gender_identity" VARCHAR(40),
    "sexual_orientation" VARCHAR(40),
    "marital_status" VARCHAR(40),
    "address" TEXT,
    "city" VARCHAR(80),
    "department" VARCHAR(80),
    "phone" VARCHAR(40),
    "email" VARCHAR(180),
    "eps" VARCHAR(120),
    "regime" VARCHAR(40),
    "affiliation_number" VARCHAR(60),
    "occupation" VARCHAR(120),
    "education_level" VARCHAR(80),
    "emergency_contact_name" VARCHAR(160),
    "emergency_contact_phone" VARCHAR(40),
    "emergency_relationship" VARCHAR(60),
    "extras" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "encounters" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "external_code" VARCHAR(60),
    "status" "EncounterStatus" NOT NULL DEFAULT 'PLANNED',
    "modality" "CareModality" NOT NULL DEFAULT 'IN_PERSON',
    "service_type" VARCHAR(80),
    "location" VARCHAR(120),
    "started_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "purpose" TEXT,
    "external_cause" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "encounters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "appointments" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "modality" "CareModality" NOT NULL DEFAULT 'IN_PERSON',
    "reason" TEXT,
    "notes" TEXT,
    "encounter_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "form_templates" (
    "id" UUID NOT NULL,
    "clinic_id" UUID,
    "specialty" "clinics_specialty_enum" NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "schema_json" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "form_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "clinical_records" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "status" "ClinicalRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "signed_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "verification_code" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clinical_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "diagnoses" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "cie_code" VARCHAR(20) NOT NULL,
    "description" TEXT NOT NULL,
    "type" "DiagnosisType" NOT NULL DEFAULT 'IMPRESSION',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "diagnoses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "clinical_procedures" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "cups_code" VARCHAR(20) NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clinical_procedures_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "consents" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "consent_type" VARCHAR(60) NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "granted_at" TIMESTAMPTZ(6),
    "evidence_path" TEXT,
    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "clinical_attachments" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" VARCHAR(80) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clinical_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "rda_exports" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "status" "RdaExportStatus" NOT NULL DEFAULT 'PENDING',
    "pdf_storage_key" TEXT,
    "fhir_storage_key" TEXT,
    "verification_code" VARCHAR(80),
    "error_message" TEXT,
    "generated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rda_exports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cie_codes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "description" TEXT NOT NULL,
    "version" VARCHAR(20) NOT NULL DEFAULT 'CIE-10',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "cie_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cups_codes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "description" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "cups_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "document_categories" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "document_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "document_requirements" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "validity_days" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_requirements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "document_files" (
    "id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" VARCHAR(80) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" VARCHAR(128),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" UUID NOT NULL,
    "clinic_id" UUID,
    "user_id" UUID,
    "action" "AuditAction" NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" VARCHAR(80),
    "ip_address" VARCHAR(60),
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "patients_clinic_id_last_name_idx" ON "patients"("clinic_id", "last_name");
CREATE UNIQUE INDEX IF NOT EXISTS "patients_clinic_id_document_type_document_number_key" ON "patients"("clinic_id", "document_type", "document_number");
CREATE UNIQUE INDEX IF NOT EXISTS "appointments_encounter_id_key" ON "appointments"("encounter_id");
CREATE INDEX IF NOT EXISTS "appointments_clinic_id_starts_at_idx" ON "appointments"("clinic_id", "starts_at");
CREATE INDEX IF NOT EXISTS "appointments_professional_id_starts_at_idx" ON "appointments"("professional_id", "starts_at");
CREATE UNIQUE INDEX IF NOT EXISTS "form_templates_specialty_code_version_key" ON "form_templates"("specialty", "code", "version");
CREATE INDEX IF NOT EXISTS "encounters_clinic_id_started_at_idx" ON "encounters"("clinic_id", "started_at");
CREATE UNIQUE INDEX IF NOT EXISTS "clinical_records_encounter_id_key" ON "clinical_records"("encounter_id");
CREATE INDEX IF NOT EXISTS "diagnoses_encounter_id_idx" ON "diagnoses"("encounter_id");
CREATE INDEX IF NOT EXISTS "diagnoses_cie_code_idx" ON "diagnoses"("cie_code");
CREATE INDEX IF NOT EXISTS "clinical_procedures_encounter_id_idx" ON "clinical_procedures"("encounter_id");
CREATE INDEX IF NOT EXISTS "clinical_procedures_cups_code_idx" ON "clinical_procedures"("cups_code");
CREATE INDEX IF NOT EXISTS "rda_exports_encounter_id_idx" ON "rda_exports"("encounter_id");
CREATE UNIQUE INDEX IF NOT EXISTS "cie_codes_code_key" ON "cie_codes"("code");
CREATE INDEX IF NOT EXISTS "cie_codes_description_idx" ON "cie_codes"("description");
CREATE UNIQUE INDEX IF NOT EXISTS "cups_codes_code_key" ON "cups_codes"("code");
CREATE INDEX IF NOT EXISTS "cups_codes_description_idx" ON "cups_codes"("description");
CREATE UNIQUE INDEX IF NOT EXISTS "document_categories_code_key" ON "document_categories"("code");
CREATE INDEX IF NOT EXISTS "document_requirements_clinic_id_category_id_idx" ON "document_requirements"("clinic_id", "category_id");
CREATE UNIQUE INDEX IF NOT EXISTS "document_requirements_clinic_id_code_key" ON "document_requirements"("clinic_id", "code");
CREATE INDEX IF NOT EXISTS "document_files_requirement_id_idx" ON "document_files"("requirement_id");
CREATE INDEX IF NOT EXISTS "audit_logs_clinic_id_created_at_idx" ON "audit_logs"("clinic_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "users_clinic_id_idx" ON "users"("clinic_id");

DO $$ BEGIN
  ALTER TABLE "patients" ADD CONSTRAINT "patients_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "appointments" ADD CONSTRAINT "appointments_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "appointments" ADD CONSTRAINT "appointments_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "encounters" ADD CONSTRAINT "encounters_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "encounters" ADD CONSTRAINT "encounters_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "encounters" ADD CONSTRAINT "encounters_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "clinical_records" ADD CONSTRAINT "clinical_records_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "clinical_records" ADD CONSTRAINT "clinical_records_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "form_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "clinical_records" ADD CONSTRAINT "clinical_records_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "clinical_procedures" ADD CONSTRAINT "clinical_procedures_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "consents" ADD CONSTRAINT "consents_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "clinical_attachments" ADD CONSTRAINT "clinical_attachments_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rda_exports" ADD CONSTRAINT "rda_exports_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "document_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_files" ADD CONSTRAINT "document_files_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "document_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "document_files" ADD CONSTRAINT "document_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
