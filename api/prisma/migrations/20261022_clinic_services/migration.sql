-- Catálogo de servicios del consultorio y vínculo opcional desde la cita.
CREATE TABLE IF NOT EXISTS "clinic_services" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "category" VARCHAR(20) NOT NULL DEFAULT 'OTRO',
    "subcategory" VARCHAR(80),
    "duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "duration_note" VARCHAR(60),
    "price" DECIMAL(12,2),
    "description" TEXT,
    "procedure_type" VARCHAR(40),
    "consent_code" VARCHAR(60),
    "assistant_service" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "clinic_services_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "clinic_services_clinic_id_name_key" ON "clinic_services"("clinic_id", "name");
CREATE INDEX IF NOT EXISTS "clinic_services_clinic_id_active_sort_order_idx" ON "clinic_services"("clinic_id", "active", "sort_order");

DO $$ BEGIN
  ALTER TABLE "clinic_services" ADD CONSTRAINT "clinic_services_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "service_id" UUID;

DO $$ BEGIN
  ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "clinic_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
