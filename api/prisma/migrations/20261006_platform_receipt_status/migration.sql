-- Estado del cobro de plataforma: PENDING = cuenta de cobro emitida y aún sin pagar.
-- Los recibos existentes quedan como PAID (equivale al comportamiento anterior).
CREATE TYPE "PlatformReceiptStatus" AS ENUM ('PAID', 'PENDING');

ALTER TABLE "platform_receipts"
  ADD COLUMN "status" "PlatformReceiptStatus" NOT NULL DEFAULT 'PAID',
  ALTER COLUMN "paid_at" DROP NOT NULL;

CREATE INDEX "platform_receipts_status_idx" ON "platform_receipts"("status");
