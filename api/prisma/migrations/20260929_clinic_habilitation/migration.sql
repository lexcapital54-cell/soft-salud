-- NIT y código de habilitación (REPS) del prestador para encabezados de epicrisis y documentos.
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "nit" VARCHAR(20);
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "habilitation_code" VARCHAR(20);
