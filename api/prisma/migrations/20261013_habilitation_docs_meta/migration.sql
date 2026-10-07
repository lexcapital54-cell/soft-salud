-- Gestión documental de habilitación: solo columnas nuevas y opcionales (no altera datos existentes).
ALTER TABLE "document_categories" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "document_requirements" ADD COLUMN IF NOT EXISTS "responsible_name" VARCHAR(160);
ALTER TABLE "document_requirements" ADD COLUMN IF NOT EXISTS "responsible_area" VARCHAR(120);
ALTER TABLE "document_requirements" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMPTZ(6);

ALTER TABLE "document_files" ADD COLUMN IF NOT EXISTS "issued_at" TIMESTAMPTZ(6);
ALTER TABLE "document_files" ADD COLUMN IF NOT EXISTS "change_reason" TEXT;
