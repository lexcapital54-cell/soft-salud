-- ERP Paso 1: extensión schema (idempotente, coexistencia TypeORM)

-- AppointmentStatus: NO_SHOW
DO $$ BEGIN
  ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'NO_SHOW';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- BillingMode
DO $$ BEGIN
  CREATE TYPE "BillingMode" AS ENUM ('RECEIPT_ONLY', 'FEV_MANUAL', 'FEV_API');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SignatureMethod" AS ENUM ('DRAW', 'OTP', 'BIOMETRIC', 'CLICKWRAP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AlertCode" AS ENUM ('ALLERGY', 'SUICIDE_RISK', 'CONTRAINDICATION', 'DRUG_INTERACTION', 'EPIDEMIOLOGIC', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AttachmentCategory" AS ENUM ('LAB', 'EXTERNAL_HCE', 'IMAGE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PackageStatus" AS ENUM ('ACTIVE', 'EXHAUSTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'CARD', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DianExportStatus" AS ENUM ('NONE', 'PENDING', 'EXPORTED', 'ACCEPTED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "EquipmentStatus" AS ENUM ('ACTIVE', 'OUT_OF_SERVICE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SupplyCategory" AS ENUM ('AESTHETIC', 'CONSUMABLE', 'MEDICATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ExpiryAlertChannel" AS ENUM ('UI', 'EMAIL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ExpiryAlertStatus" AS ENUM ('PENDING', 'SENT', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RepsResult" AS ENUM ('CUMPLE', 'NO_CUMPLE', 'NA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Clinic.billing_mode
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "billing_mode" "BillingMode" NOT NULL DEFAULT 'RECEIPT_ONLY';

-- ClinicalRecord immutability
ALTER TABLE "clinical_records" ADD COLUMN IF NOT EXISTS "content_hash" VARCHAR(128);
ALTER TABLE "clinical_records" ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMPTZ(6);
ALTER TABLE "clinical_records" ADD COLUMN IF NOT EXISTS "lock_reason" VARCHAR(160);

-- CieCode.is_critical
ALTER TABLE "cie_codes" ADD COLUMN IF NOT EXISTS "is_critical" BOOLEAN NOT NULL DEFAULT false;

-- ClinicalAttachment extensions
ALTER TABLE "clinical_attachments" ADD COLUMN IF NOT EXISTS "uploaded_by_id" UUID;
ALTER TABLE "clinical_attachments" ADD COLUMN IF NOT EXISTS "category" "AttachmentCategory" NOT NULL DEFAULT 'OTHER';

-- ClinicalConsent (tabla consents) extensions — encounter_id pasa a nullable
ALTER TABLE "consents" ALTER COLUMN "encounter_id" DROP NOT NULL;
ALTER TABLE "consents" ADD COLUMN IF NOT EXISTS "clinic_id" UUID;
ALTER TABLE "consents" ADD COLUMN IF NOT EXISTS "patient_id" UUID;
ALTER TABLE "consents" ADD COLUMN IF NOT EXISTS "template_code" VARCHAR(60);
ALTER TABLE "consents" ADD COLUMN IF NOT EXISTS "procedure_cups_code" VARCHAR(20);
ALTER TABLE "consents" ADD COLUMN IF NOT EXISTS "signed_payload" JSONB;
ALTER TABLE "consents" ADD COLUMN IF NOT EXISTS "signature_method" "SignatureMethod";
ALTER TABLE "consents" ADD COLUMN IF NOT EXISTS "content_hash" VARCHAR(128);
ALTER TABLE "consents" ADD COLUMN IF NOT EXISTS "immutable_at" TIMESTAMPTZ(6);

CREATE TABLE IF NOT EXISTS "appointment_admissions" (
  "id" UUID NOT NULL,
  "appointment_id" UUID NOT NULL,
  "habeas_data_signed" BOOLEAN NOT NULL DEFAULT false,
  "habeas_data_signed_at" TIMESTAMPTZ(6),
  "signed_by_name" VARCHAR(160),
  "document_number" VARCHAR(40),
  "signature_storage_key" TEXT,
  "ip_address" VARCHAR(60),
  "user_agent" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appointment_admissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "appointment_admissions_appointment_id_key" ON "appointment_admissions"("appointment_id");

CREATE TABLE IF NOT EXISTS "clinical_evolutions" (
  "id" UUID NOT NULL,
  "clinical_record_id" UUID NOT NULL,
  "author_id" UUID NOT NULL,
  "content" JSONB NOT NULL,
  "content_hash" VARCHAR(128) NOT NULL,
  "signed_at" TIMESTAMPTZ(6) NOT NULL,
  "immutable" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_evolutions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "clinical_evolutions_clinical_record_id_signed_at_idx" ON "clinical_evolutions"("clinical_record_id", "signed_at");

CREATE TABLE IF NOT EXISTS "clarification_notes" (
  "id" UUID NOT NULL,
  "clinical_record_id" UUID NOT NULL,
  "author_id" UUID NOT NULL,
  "reason" VARCHAR(255) NOT NULL,
  "content" TEXT NOT NULL,
  "content_hash" VARCHAR(128) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clarification_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "clarification_notes_clinical_record_id_created_at_idx" ON "clarification_notes"("clinical_record_id", "created_at");

CREATE TABLE IF NOT EXISTS "clinical_alerts" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "patient_id" UUID NOT NULL,
  "encounter_id" UUID,
  "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
  "code" "AlertCode" NOT NULL,
  "message" TEXT NOT NULL,
  "source" JSONB,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "acknowledged_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "clinical_alerts_clinic_id_patient_id_is_active_idx" ON "clinical_alerts"("clinic_id", "patient_id", "is_active");
CREATE INDEX IF NOT EXISTS "clinical_alerts_encounter_id_idx" ON "clinical_alerts"("encounter_id");

CREATE TABLE IF NOT EXISTS "clinical_consent_templates" (
  "id" UUID NOT NULL,
  "clinic_id" UUID,
  "specialty" "clinics_specialty_enum" NOT NULL,
  "code" VARCHAR(60) NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "body_markdown" TEXT,
  "body_json" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinical_consent_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "clinical_consent_templates_specialty_code_version_key" ON "clinical_consent_templates"("specialty", "code", "version");

CREATE TABLE IF NOT EXISTS "session_packages" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "patient_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "total_sessions" INTEGER NOT NULL,
  "used_sessions" INTEGER NOT NULL DEFAULT 0,
  "cups_code" VARCHAR(20),
  "unit_price" DECIMAL(12,2) NOT NULL,
  "status" "PackageStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "session_packages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "session_packages_clinic_id_patient_id_status_idx" ON "session_packages"("clinic_id", "patient_id", "status");

CREATE TABLE IF NOT EXISTS "invoices" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "patient_id" UUID NOT NULL,
  "appointment_id" UUID,
  "encounter_id" UUID,
  "number" VARCHAR(60) NOT NULL,
  "issued_at" TIMESTAMPTZ(6),
  "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "billing_mode" "BillingMode" NOT NULL,
  "subtotal" DECIMAL(12,2) NOT NULL,
  "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(12,2) NOT NULL,
  "rips_json" JSONB,
  "rips_storage_key" TEXT,
  "fev_payload" JSONB,
  "dian_export_status" "DianExportStatus" NOT NULL DEFAULT 'NONE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "invoices_clinic_id_number_key" ON "invoices"("clinic_id", "number");
CREATE INDEX IF NOT EXISTS "invoices_clinic_id_issued_at_idx" ON "invoices"("clinic_id", "issued_at");
CREATE INDEX IF NOT EXISTS "invoices_patient_id_idx" ON "invoices"("patient_id");

CREATE TABLE IF NOT EXISTS "invoice_items" (
  "id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "description" VARCHAR(255) NOT NULL,
  "cups_code" VARCHAR(20),
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unit_price" DECIMAL(12,2) NOT NULL,
  "package_id" UUID,
  "appointment_id" UUID,
  CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

CREATE TABLE IF NOT EXISTS "transactions" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "type" "TransactionType" NOT NULL,
  "category" VARCHAR(80) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'COP',
  "invoice_id" UUID,
  "paid_at" TIMESTAMPTZ(6) NOT NULL,
  "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
  "notes" TEXT,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "transactions_clinic_id_paid_at_idx" ON "transactions"("clinic_id", "paid_at");
CREATE INDEX IF NOT EXISTS "transactions_type_category_idx" ON "transactions"("type", "category");

CREATE TABLE IF NOT EXISTS "quality_snapshots" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "incomplete_hc_rate" DOUBLE PRECISION NOT NULL,
  "avg_close_hours" DOUBLE PRECISION NOT NULL,
  "consent_gap_count" INTEGER NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quality_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "quality_snapshots_clinic_id_date_key" ON "quality_snapshots"("clinic_id", "date");

CREATE TABLE IF NOT EXISTS "equipment_resumes" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "brand" VARCHAR(120),
  "serial" VARCHAR(120),
  "location" VARCHAR(120),
  "last_calibration_at" TIMESTAMPTZ(6),
  "next_calibration_at" TIMESTAMPTZ(6),
  "status" "EquipmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "equipment_resumes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "equipment_resumes_clinic_id_next_calibration_at_idx" ON "equipment_resumes"("clinic_id", "next_calibration_at");

CREATE TABLE IF NOT EXISTS "equipment_maintenances" (
  "id" UUID NOT NULL,
  "equipment_id" UUID NOT NULL,
  "performed_at" TIMESTAMPTZ(6) NOT NULL,
  "next_due_at" TIMESTAMPTZ(6),
  "notes" TEXT,
  "attachment_key" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "equipment_maintenances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "equipment_maintenances_equipment_id_performed_at_idx" ON "equipment_maintenances"("equipment_id", "performed_at");

CREATE TABLE IF NOT EXISTS "supply_items" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "lot_number" VARCHAR(80),
  "expires_at" TIMESTAMPTZ(6),
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "category" "SupplyCategory" NOT NULL DEFAULT 'CONSUMABLE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supply_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "supply_items_clinic_id_expires_at_idx" ON "supply_items"("clinic_id", "expires_at");

CREATE TABLE IF NOT EXISTS "expiry_alerts" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "entity_type" VARCHAR(80) NOT NULL,
  "entity_id" VARCHAR(80) NOT NULL,
  "due_at" TIMESTAMPTZ(6) NOT NULL,
  "remind_at_30" TIMESTAMPTZ(6),
  "remind_at_15" TIMESTAMPTZ(6),
  "channel" "ExpiryAlertChannel" NOT NULL DEFAULT 'UI',
  "sent_at" TIMESTAMPTZ(6),
  "status" "ExpiryAlertStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expiry_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "expiry_alerts_clinic_id_status_due_at_idx" ON "expiry_alerts"("clinic_id", "status", "due_at");
CREATE INDEX IF NOT EXISTS "expiry_alerts_entity_type_entity_id_idx" ON "expiry_alerts"("entity_type", "entity_id");

CREATE TABLE IF NOT EXISTS "reps_checklists" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "standard_code" VARCHAR(60) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reps_checklists_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "reps_checklists_clinic_id_standard_code_idx" ON "reps_checklists"("clinic_id", "standard_code");

CREATE TABLE IF NOT EXISTS "reps_checklist_items" (
  "id" UUID NOT NULL,
  "checklist_id" UUID NOT NULL,
  "item_code" VARCHAR(60) NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "result" "RepsResult" NOT NULL DEFAULT 'NA',
  "evidence_file_id" UUID,
  "evaluated_at" TIMESTAMPTZ(6),
  "notes" TEXT,
  CONSTRAINT "reps_checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "reps_checklist_items_checklist_id_item_code_key" ON "reps_checklist_items"("checklist_id", "item_code");

-- Foreign keys (ignore if already exist)
DO $$ BEGIN
  ALTER TABLE "appointment_admissions" ADD CONSTRAINT "appointment_admissions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "clinical_evolutions" ADD CONSTRAINT "clinical_evolutions_clinical_record_id_fkey" FOREIGN KEY ("clinical_record_id") REFERENCES "clinical_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "clinical_evolutions" ADD CONSTRAINT "clinical_evolutions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "clarification_notes" ADD CONSTRAINT "clarification_notes_clinical_record_id_fkey" FOREIGN KEY ("clinical_record_id") REFERENCES "clinical_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "clarification_notes" ADD CONSTRAINT "clarification_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "clinical_alerts" ADD CONSTRAINT "clinical_alerts_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "clinical_alerts" ADD CONSTRAINT "clinical_alerts_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "clinical_alerts" ADD CONSTRAINT "clinical_alerts_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "clinical_consent_templates" ADD CONSTRAINT "clinical_consent_templates_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "consents" ADD CONSTRAINT "consents_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "consents" ADD CONSTRAINT "consents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "clinical_attachments" ADD CONSTRAINT "clinical_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "session_packages" ADD CONSTRAINT "session_packages_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "session_packages" ADD CONSTRAINT "session_packages_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "session_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "transactions" ADD CONSTRAINT "transactions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "transactions" ADD CONSTRAINT "transactions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "quality_snapshots" ADD CONSTRAINT "quality_snapshots_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "equipment_resumes" ADD CONSTRAINT "equipment_resumes_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "equipment_maintenances" ADD CONSTRAINT "equipment_maintenances_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "equipment_resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "supply_items" ADD CONSTRAINT "supply_items_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "expiry_alerts" ADD CONSTRAINT "expiry_alerts_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "reps_checklists" ADD CONSTRAINT "reps_checklists_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "reps_checklist_items" ADD CONSTRAINT "reps_checklist_items_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "reps_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
