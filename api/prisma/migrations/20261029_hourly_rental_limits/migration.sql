-- Cupos simultáneos de salas y tope mensual de horas por profesional (arriendo HCE).
ALTER TABLE "clinics"
  ADD COLUMN IF NOT EXISTS "hourly_max_concurrent_rooms" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "hourly_max_hours_per_month" INTEGER NOT NULL DEFAULT 50;
