-- Habilitar / deshabilitar requisitos documentales por consultorio.
ALTER TABLE "document_requirements"
  ADD COLUMN IF NOT EXISTS "is_enabled" BOOLEAN NOT NULL DEFAULT true;
