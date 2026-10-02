-- Datos del pagador y plan del consultorio congelados a la fecha del cobro.
ALTER TABLE "platform_receipts"
  ADD COLUMN "payer_name" VARCHAR(160),
  ADD COLUMN "payer_document" VARCHAR(40),
  ADD COLUMN "payer_phone" VARCHAR(40),
  ADD COLUMN "payer_email" VARCHAR(180),
  ADD COLUMN "plan_label" VARCHAR(160);
