-- Enrutador Clínico/Legal Paso 1: pathway, tutor, signerRole, firma profesional (idempotente)

-- Enums
DO $$ BEGIN
  CREATE TYPE "ClinicalPathway" AS ENUM ('ADULT', 'NNA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ConsentSignerRole" AS ENUM ('PATIENT', 'LEGAL_GUARDIAN', 'ASSENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- users: firma profesional para sellado HCE (Paso 4)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "professional_signature_base64" TEXT;

-- patients: representante legal / tutor
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "is_minor_override" BOOLEAN;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "guardian_full_name" VARCHAR(160);
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "guardian_document_type" VARCHAR(20);
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "guardian_document_number" VARCHAR(40);
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "guardian_relationship" VARCHAR(60);
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "guardian_phone" VARCHAR(40);
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "guardian_email" VARCHAR(180);
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "legal_custody_notes" TEXT;

-- encounters: pathway persistido de la atención
ALTER TABLE "encounters" ADD COLUMN IF NOT EXISTS "clinical_pathway" "ClinicalPathway";
ALTER TABLE "encounters" ADD COLUMN IF NOT EXISTS "pathway_reason" VARCHAR(120);

-- clinical_records: perfil de formulario JSONB (ADULT | PEDIATRIC)
ALTER TABLE "clinical_records" ADD COLUMN IF NOT EXISTS "content_profile" VARCHAR(20);
UPDATE "clinical_records" SET "content_profile" = 'ADULT' WHERE "content_profile" IS NULL;
ALTER TABLE "clinical_records" ALTER COLUMN "content_profile" SET DEFAULT 'ADULT';
ALTER TABLE "clinical_records" ALTER COLUMN "content_profile" SET NOT NULL;

-- patient_consents: rol de firmante + tipo de documento
ALTER TABLE "patient_consents" ADD COLUMN IF NOT EXISTS "signer_role" "ConsentSignerRole";
UPDATE "patient_consents" SET "signer_role" = 'PATIENT' WHERE "signer_role" IS NULL;
ALTER TABLE "patient_consents" ALTER COLUMN "signer_role" SET DEFAULT 'PATIENT';
ALTER TABLE "patient_consents" ALTER COLUMN "signer_role" SET NOT NULL;

ALTER TABLE "patient_consents" ADD COLUMN IF NOT EXISTS "signer_document_type" VARCHAR(20);

-- Índice para doble/triple firma NNA (misma plantilla, distinto rol)
CREATE INDEX IF NOT EXISTS "patient_consents_encounter_id_template_id_signer_role_idx"
  ON "patient_consents" ("encounter_id", "template_id", "signer_role");
