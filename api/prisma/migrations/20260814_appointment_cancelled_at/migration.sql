-- El hueco de una cita cancelada queda disponible durante una ventana corta y
-- luego se cierra; para medirla hace falta saber cuándo se canceló.
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMPTZ(6);

-- Las cancelaciones anteriores a este cambio no tienen marca: se toma la última
-- actualización, de modo que su ventana ya esté vencida y la franja quede cerrada.
UPDATE "appointments"
   SET "cancelled_at" = "updated_at"
 WHERE "status" = 'CANCELLED' AND "cancelled_at" IS NULL;
