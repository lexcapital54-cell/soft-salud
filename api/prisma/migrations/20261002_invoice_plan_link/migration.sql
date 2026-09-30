-- Cruce recibo de caja ↔ plan de tratamiento (odontología) / presupuesto de ortodoncia.
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "plan_item_key" VARCHAR(120);
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "plan_source" VARCHAR(20);
CREATE INDEX IF NOT EXISTS "invoice_items_plan_item_key_idx" ON "invoice_items"("plan_item_key");
