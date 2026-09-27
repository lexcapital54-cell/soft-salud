-- Suspensión por mora de arrendamiento mensual del servidor

ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "hosting_period_due" DATE;
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "hosting_suspended_at" TIMESTAMPTZ(6);
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "hosting_due_notified_at" TIMESTAMPTZ(6);
