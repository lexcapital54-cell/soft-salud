-- Ingresos de plataforma HabiliSALUD (SUPER_ADMIN)

CREATE TYPE "PlatformPlanVariant" AS ENUM ('WITHOUT_DOCS', 'WITH_DOCS');
CREATE TYPE "PlatformChargeKind" AS ENUM ('CLINIC_SETUP', 'MONTHLY_HOSTING', 'OTHER');

CREATE TABLE "platform_fees" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "kind" "PlatformChargeKind" NOT NULL,
    "plan" "PlatformPlanVariant" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'COP',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_fees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_fees_code_key" ON "platform_fees"("code");

CREATE TABLE "platform_receipts" (
    "id" UUID NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "clinic_id" UUID NOT NULL,
    "kind" "PlatformChargeKind" NOT NULL,
    "plan" "PlatformPlanVariant" NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'COP',
    "method" "PaymentMethod" NOT NULL DEFAULT 'TRANSFER',
    "paid_at" TIMESTAMPTZ(6) NOT NULL,
    "period_month" DATE,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_receipts_number_key" ON "platform_receipts"("number");
CREATE INDEX "platform_receipts_paid_at_idx" ON "platform_receipts"("paid_at");
CREATE INDEX "platform_receipts_clinic_id_kind_period_month_idx" ON "platform_receipts"("clinic_id", "kind", "period_month");

ALTER TABLE "platform_receipts" ADD CONSTRAINT "platform_receipts_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_receipts" ADD CONSTRAINT "platform_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tarifas iniciales (editables desde el panel SUPER_ADMIN)
INSERT INTO "platform_fees" ("id", "code", "label", "kind", "plan", "amount", "currency", "is_active", "updated_at", "created_at")
VALUES
  (gen_random_uuid(), 'SETUP_WITHOUT_DOCS', 'Alta consultorio sin documentación', 'CLINIC_SETUP', 'WITHOUT_DOCS', 500000.00, 'COP', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SETUP_WITH_DOCS', 'Alta consultorio con documentación', 'CLINIC_SETUP', 'WITH_DOCS', 900000.00, 'COP', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'HOSTING_WITHOUT_DOCS', 'Arrendamiento mensual servidor (sin docs)', 'MONTHLY_HOSTING', 'WITHOUT_DOCS', 180000.00, 'COP', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'HOSTING_WITH_DOCS', 'Arrendamiento mensual servidor (con docs)', 'MONTHLY_HOSTING', 'WITH_DOCS', 280000.00, 'COP', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
