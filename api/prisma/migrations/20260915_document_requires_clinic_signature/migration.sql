-- Firma de contraparte del consultorio solo cuando el SUPER_ADMIN lo marca.
ALTER TABLE "document_requirements"
  ADD COLUMN IF NOT EXISTS "requires_clinic_signature" BOOLEAN NOT NULL DEFAULT false;
