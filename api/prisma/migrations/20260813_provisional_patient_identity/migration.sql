-- Las fichas provisionales no tienen documento, así que el índice único por
-- documento no las protege. Esta clave natural alternativa (nombre + teléfono
-- normalizado dentro del consultorio) impide que el mismo paciente se cree dos
-- veces y termine con la historia clínica partida.
CREATE UNIQUE INDEX IF NOT EXISTS "patients_provisional_identity_key"
  ON "patients" (
    "clinic_id",
    lower("first_name"),
    lower("last_name"),
    regexp_replace("phone", '\D', '', 'g')
  )
  WHERE "document_number" IS NULL AND "phone" IS NOT NULL;
