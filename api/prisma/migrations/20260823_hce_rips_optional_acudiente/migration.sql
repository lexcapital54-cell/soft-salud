-- HCE psychology: RIPS opt-in, patient photo, per-encounter RIPS flag
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "rips_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "patients"
  ADD COLUMN IF NOT EXISTS "photo_url" TEXT;

ALTER TABLE "encounters"
  ADD COLUMN IF NOT EXISTS "generate_rips" BOOLEAN NOT NULL DEFAULT false;
