-- Versionado inmutable + firmas Elaboró / Revisó / Aprobó para el expediente documental.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentFileStatus') THEN
    CREATE TYPE "DocumentFileStatus" AS ENUM (
      'PENDING_SIGNATURE',
      'PARTIALLY_SIGNED',
      'SIGNED',
      'RETIRED'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentSignerRole') THEN
    CREATE TYPE "DocumentSignerRole" AS ENUM (
      'ELABORO',
      'REVISO',
      'APROBO'
    );
  END IF;
END $$;

ALTER TABLE "document_files"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "period_label" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "status" "DocumentFileStatus" NOT NULL DEFAULT 'PENDING_SIGNATURE',
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "retired_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW();

-- Numera las versiones existentes por requisito (orden cronológico).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY requirement_id ORDER BY created_at ASC, id ASC) AS rn
  FROM document_files
)
UPDATE document_files AS df
SET version = ranked.rn
FROM ranked
WHERE df.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS "document_files_requirement_id_version_key"
  ON "document_files" ("requirement_id", "version");

CREATE INDEX IF NOT EXISTS "document_files_requirement_id_status_idx"
  ON "document_files" ("requirement_id", "status");

CREATE TABLE IF NOT EXISTS "document_signatures" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_file_id" UUID NOT NULL,
  "role" "DocumentSignerRole" NOT NULL,
  "signer_user_id" UUID,
  "signer_name" VARCHAR(160) NOT NULL,
  "signature_base64" TEXT NOT NULL,
  "content_hash" VARCHAR(128),
  "ip_address" VARCHAR(60),
  "user_agent" TEXT,
  "signed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "document_signatures_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_signatures_document_file_id_fkey"
    FOREIGN KEY ("document_file_id") REFERENCES "document_files"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "document_signatures_signer_user_id_fkey"
    FOREIGN KEY ("signer_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_signatures_document_file_id_role_key"
  ON "document_signatures" ("document_file_id", "role");

CREATE INDEX IF NOT EXISTS "document_signatures_document_file_id_idx"
  ON "document_signatures" ("document_file_id");
