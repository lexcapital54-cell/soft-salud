-- Módulo de arriendo de HCE por horas; queda desactivado hasta que el superadmin lo active.
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "hourly_rental_enabled" BOOLEAN NOT NULL DEFAULT false;
