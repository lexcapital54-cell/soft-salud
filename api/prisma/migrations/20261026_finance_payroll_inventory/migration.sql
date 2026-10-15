-- Nómina / PILA e inventario del módulo Operación y Finanzas (por consultorio).

CREATE TYPE "PayrollRunStatus" AS ENUM ('LIQUIDADO', 'PAGADO', 'PENDIENTE');
CREATE TYPE "PayrollNoveltyType" AS ENUM ('INGRESO', 'VACACIONES', 'INCAPACIDAD', 'LICENCIA_REM', 'LICENCIA_NO_REM', 'RETIRO');
CREATE TYPE "SupplyMovementType" AS ENUM ('IN', 'OUT', 'ADJUST');

ALTER TABLE "supply_items"
  ADD COLUMN IF NOT EXISTS "sku" VARCHAR(60),
  ADD COLUMN IF NOT EXISTS "unit" VARCHAR(20) NOT NULL DEFAULT 'und',
  ADD COLUMN IF NOT EXISTS "unit_cost" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "min_stock" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

CREATE INDEX IF NOT EXISTS "supply_items_clinic_id_name_idx" ON "supply_items"("clinic_id", "name");

CREATE TABLE IF NOT EXISTS "supply_movements" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "supply_item_id" UUID NOT NULL,
  "type" "SupplyMovementType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_cost" DECIMAL(12, 2),
  "notes" TEXT,
  "moved_at" TIMESTAMPTZ(6) NOT NULL,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supply_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "supply_movements_clinic_id_moved_at_idx" ON "supply_movements"("clinic_id", "moved_at");
CREATE INDEX IF NOT EXISTS "supply_movements_supply_item_id_moved_at_idx" ON "supply_movements"("supply_item_id", "moved_at");

ALTER TABLE "supply_movements"
  ADD CONSTRAINT "supply_movements_clinic_id_fkey"
  FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supply_movements"
  ADD CONSTRAINT "supply_movements_supply_item_id_fkey"
  FOREIGN KEY ("supply_item_id") REFERENCES "supply_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supply_movements"
  ADD CONSTRAINT "supply_movements_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "payroll_settings" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "smmlv" DECIMAL(12, 2) NOT NULL,
  "transport_aid" DECIMAL(12, 2) NOT NULL,
  "exempt_114" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "payroll_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_settings_clinic_id_key" ON "payroll_settings"("clinic_id");
ALTER TABLE "payroll_settings"
  ADD CONSTRAINT "payroll_settings_clinic_id_fkey"
  FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "payroll_runs" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "period" VARCHAR(7) NOT NULL,
  "employee_name" VARCHAR(160) NOT NULL,
  "id_number" VARCHAR(40) NOT NULL,
  "role" VARCHAR(120),
  "department" VARCHAR(120),
  "pay_date" DATE,
  "status" "PayrollRunStatus" NOT NULL DEFAULT 'LIQUIDADO',
  "input" JSONB NOT NULL,
  "result" JSONB NOT NULL,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_runs_clinic_id_id_number_period_key" ON "payroll_runs"("clinic_id", "id_number", "period");
CREATE INDEX IF NOT EXISTS "payroll_runs_clinic_id_period_idx" ON "payroll_runs"("clinic_id", "period");
ALTER TABLE "payroll_runs"
  ADD CONSTRAINT "payroll_runs_clinic_id_fkey"
  FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_runs"
  ADD CONSTRAINT "payroll_runs_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "payroll_novelties" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "employee_name" VARCHAR(160) NOT NULL,
  "type" "PayrollNoveltyType" NOT NULL,
  "from_date" DATE NOT NULL,
  "to_date" DATE NOT NULL,
  "notes" TEXT,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_novelties_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payroll_novelties_clinic_id_from_date_idx" ON "payroll_novelties"("clinic_id", "from_date");
ALTER TABLE "payroll_novelties"
  ADD CONSTRAINT "payroll_novelties_clinic_id_fkey"
  FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_novelties"
  ADD CONSTRAINT "payroll_novelties_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
