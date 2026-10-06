-- Consultorios de demostración comercial (datos ficticios).
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "is_demo" BOOLEAN NOT NULL DEFAULT false;
