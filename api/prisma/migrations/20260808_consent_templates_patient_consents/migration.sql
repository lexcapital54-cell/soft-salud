-- Consent Templates Paso 1: ConsentTemplate + PatientConsent (idempotente)

-- Renombrar clinical_consent_templates → consent_templates (si aplica)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'clinical_consent_templates'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'consent_templates'
  ) THEN
    ALTER TABLE "clinical_consent_templates" RENAME TO "consent_templates";
  END IF;
END $$;

-- Crear consent_templates si no existe (instalaciones frescas)
CREATE TABLE IF NOT EXISTS "consent_templates" (
  "id" UUID NOT NULL,
  "clinic_id" UUID,
  "specialty" "clinics_specialty_enum" NOT NULL,
  "code" VARCHAR(60) NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "body_html" TEXT NOT NULL DEFAULT '',
  "body_markdown" TEXT,
  "body_json" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consent_templates_pkey" PRIMARY KEY ("id")
);

-- Columnas nuevas / ajustes sobre tabla renombrada o existente
ALTER TABLE "consent_templates" ADD COLUMN IF NOT EXISTS "body_html" TEXT;
UPDATE "consent_templates" SET "body_html" = COALESCE("body_html", COALESCE("body_markdown", '')) WHERE "body_html" IS NULL OR "body_html" = '';
ALTER TABLE "consent_templates" ALTER COLUMN "body_html" SET DEFAULT '';
ALTER TABLE "consent_templates" ALTER COLUMN "body_html" SET NOT NULL;

ALTER TABLE "consent_templates" ADD COLUMN IF NOT EXISTS "body_markdown" TEXT;
ALTER TABLE "consent_templates" ADD COLUMN IF NOT EXISTS "body_json" JSONB;
ALTER TABLE "consent_templates" ADD COLUMN IF NOT EXISTS "version" INTEGER;
UPDATE "consent_templates" SET "version" = 1 WHERE "version" IS NULL;
ALTER TABLE "consent_templates" ALTER COLUMN "version" SET DEFAULT 1;
ALTER TABLE "consent_templates" ALTER COLUMN "version" SET NOT NULL;

ALTER TABLE "consent_templates" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN;
UPDATE "consent_templates" SET "is_active" = true WHERE "is_active" IS NULL;
ALTER TABLE "consent_templates" ALTER COLUMN "is_active" SET DEFAULT true;
ALTER TABLE "consent_templates" ALTER COLUMN "is_active" SET NOT NULL;

ALTER TABLE "consent_templates" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ(6);
UPDATE "consent_templates" SET "created_at" = CURRENT_TIMESTAMP WHERE "created_at" IS NULL;
ALTER TABLE "consent_templates" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "consent_templates" ALTER COLUMN "created_at" SET NOT NULL;

ALTER TABLE "consent_templates" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(6);
UPDATE "consent_templates" SET "updated_at" = CURRENT_TIMESTAMP WHERE "updated_at" IS NULL;
ALTER TABLE "consent_templates" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "consent_templates" ALTER COLUMN "updated_at" SET NOT NULL;

-- Renombrar índices/constraints heredados
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_consent_templates_pkey') THEN
    ALTER TABLE "consent_templates" RENAME CONSTRAINT "clinical_consent_templates_pkey" TO "consent_templates_pkey";
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'clinical_consent_templates_specialty_code_version_key'
  ) THEN
    ALTER INDEX "clinical_consent_templates_specialty_code_version_key"
      RENAME TO "consent_templates_specialty_code_version_key";
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "consent_templates_specialty_code_version_key"
  ON "consent_templates"("specialty", "code", "version");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinical_consent_templates_clinic_id_fkey'
  ) THEN
    ALTER TABLE "consent_templates"
      RENAME CONSTRAINT "clinical_consent_templates_clinic_id_fkey" TO "consent_templates_clinic_id_fkey";
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "consent_templates"
    ADD CONSTRAINT "consent_templates_clinic_id_fkey"
    FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- patient_consents
CREATE TABLE IF NOT EXISTS "patient_consents" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "patient_id" UUID NOT NULL,
  "encounter_id" UUID,
  "template_id" UUID NOT NULL,
  "signer_name" VARCHAR(160),
  "signer_document" VARCHAR(40),
  "signature_base64" TEXT NOT NULL,
  "signed_at" TIMESTAMPTZ(6) NOT NULL,
  "ip_address" VARCHAR(60),
  "user_agent" TEXT,
  "pdf_storage_key" TEXT,
  "content_hash" VARCHAR(128),
  "immutable_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "patient_consents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "patient_consents_patient_id_template_id_idx"
  ON "patient_consents"("patient_id", "template_id");
CREATE INDEX IF NOT EXISTS "patient_consents_encounter_id_idx"
  ON "patient_consents"("encounter_id");
CREATE INDEX IF NOT EXISTS "patient_consents_clinic_id_signed_at_idx"
  ON "patient_consents"("clinic_id", "signed_at");

DO $$
BEGIN
  ALTER TABLE "patient_consents"
    ADD CONSTRAINT "patient_consents_clinic_id_fkey"
    FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "patient_consents"
    ADD CONSTRAINT "patient_consents_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "patient_consents"
    ADD CONSTRAINT "patient_consents_encounter_id_fkey"
    FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "patient_consents"
    ADD CONSTRAINT "patient_consents_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "consent_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
