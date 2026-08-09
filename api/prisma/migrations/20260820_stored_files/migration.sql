-- Binarios de documentos/adjuntos/PDFs en Postgres (fuente de verdad).
CREATE TABLE IF NOT EXISTS "stored_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storage_key" TEXT NOT NULL,
    "mime_type" VARCHAR(80) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "content_hash" VARCHAR(128),
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "stored_files_storage_key_key" ON "stored_files"("storage_key");
CREATE INDEX IF NOT EXISTS "stored_files_created_at_idx" ON "stored_files"("created_at");
