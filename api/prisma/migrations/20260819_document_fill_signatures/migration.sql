-- Firmas de capacitación (Capacitador / Asistente) y datos de formulario diligenciado.

DO $$ BEGIN
  ALTER TYPE "DocumentSignerRole" ADD VALUE 'CAPACITADOR';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "DocumentSignerRole" ADD VALUE 'ASISTENTE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "document_files"
  ADD COLUMN IF NOT EXISTS "form_data" JSONB;
