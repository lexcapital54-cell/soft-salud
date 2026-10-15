-- Módulo Operación y Finanzas por consultorio; queda desactivado hasta que el superadmin lo active.
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "finance_enabled" BOOLEAN NOT NULL DEFAULT false;
