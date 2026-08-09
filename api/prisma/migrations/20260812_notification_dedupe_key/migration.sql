-- La unicidad por (cita, tipo, canal) también bloqueaba los reenvíos manuales,
-- que por diseño deben poder repetirse. Se sustituye por una clave de
-- deduplicación que solo se rellena en los recordatorios automáticos:
-- Postgres admite varios NULL en un índice único, así que los reenvíos
-- manuales quedan libres y conservan historial completo.

DROP INDEX IF EXISTS "notification_logs_appointment_id_kind_channel_key";

ALTER TABLE "notification_logs"
  ADD COLUMN IF NOT EXISTS "dedupe_key" VARCHAR(180);

-- Rellena filas previas (si las hubiera) para no perder la protección del cron.
UPDATE "notification_logs"
SET "dedupe_key" = "appointment_id" || ':' || "kind" || ':' || "channel"
WHERE "dedupe_key" IS NULL
  AND "appointment_id" IS NOT NULL
  AND "kind" <> 'MANUAL_RESEND';

CREATE UNIQUE INDEX IF NOT EXISTS "notification_logs_dedupe_key_key"
  ON "notification_logs" ("dedupe_key");
