-- fecha_atencion_clinica: fecha real de la sesión (seleccionable, admite días anteriores).
-- created_at (fecha_sistema) sigue siendo el timestamp de inserción para auditoría.
ALTER TABLE "clinical_evolutions"
  ADD COLUMN IF NOT EXISTS "clinical_attention_date" TIMESTAMPTZ(6);

UPDATE "clinical_evolutions"
  SET "clinical_attention_date" = "signed_at"
  WHERE "clinical_attention_date" IS NULL;

CREATE INDEX IF NOT EXISTS "clinical_evolutions_clinical_record_id_clinical_attention_date_idx"
  ON "clinical_evolutions" ("clinical_record_id", "clinical_attention_date");

-- created_at inmodificable: cualquier UPDATE conserva el valor original.
CREATE OR REPLACE FUNCTION clinical_evolutions_keep_created_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."created_at" := OLD."created_at";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clinical_evolutions_keep_created_at ON "clinical_evolutions";
CREATE TRIGGER clinical_evolutions_keep_created_at
  BEFORE UPDATE ON "clinical_evolutions"
  FOR EACH ROW EXECUTE FUNCTION clinical_evolutions_keep_created_at();
