-- El número de afiliación no se usa en la historia clínica ni en RIPS: la EPS
-- y el tipo de usuario bastan para identificar la cobertura.
ALTER TABLE "patients" DROP COLUMN IF EXISTS "affiliation_number";
