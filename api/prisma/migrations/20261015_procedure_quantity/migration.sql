-- Cantidad de cada procedimiento CUPS de la historia (los existentes quedan en 1).
ALTER TABLE "clinical_procedures" ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1;
