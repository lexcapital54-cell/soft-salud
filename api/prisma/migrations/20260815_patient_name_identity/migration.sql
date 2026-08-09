-- La identidad de una ficha provisional es el nombre, no el nombre + teléfono:
-- el mismo paciente puede dar otro número y no debe abrir una segunda ficha
-- (partiría su historia clínica, que es única por paciente).
DROP INDEX IF EXISTS "patients_provisional_identity_key";

CREATE UNIQUE INDEX IF NOT EXISTS "patients_provisional_name_key"
  ON "patients" (
    "clinic_id",
    lower(btrim("first_name")),
    lower(btrim("last_name"))
  )
  WHERE "document_number" IS NULL;
