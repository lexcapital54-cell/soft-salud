-- DiagnosisCatalog: CIE-10/CIE-11 Psicología/Psiquiatría (idempotente)

DO $$ BEGIN
  CREATE TYPE "DiagnosisCatalogCategory" AS ENUM ('PEDIATRIA', 'ADULTOS', 'PSICOSOCIAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "diagnosis_catalog" (
  "id" UUID NOT NULL,
  "cie10_code" VARCHAR(20) NOT NULL,
  "cie11_code" VARCHAR(20) NOT NULL,
  "description" TEXT NOT NULL,
  "category" "DiagnosisCatalogCategory" NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "diagnosis_catalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "diagnosis_catalog_cie10_code_key"
  ON "diagnosis_catalog" ("cie10_code");
CREATE INDEX IF NOT EXISTS "diagnosis_catalog_description_idx"
  ON "diagnosis_catalog" ("description");
CREATE INDEX IF NOT EXISTS "diagnosis_catalog_category_idx"
  ON "diagnosis_catalog" ("category");
CREATE INDEX IF NOT EXISTS "diagnosis_catalog_cie11_code_idx"
  ON "diagnosis_catalog" ("cie11_code");
