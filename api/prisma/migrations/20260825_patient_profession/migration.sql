-- Profesión del paciente (aparte de ocupación laboral).
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "profession" VARCHAR(120);
