-- Título profesional que se imprime bajo el nombre en la firma del PDF (opcional).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "professional_title" VARCHAR(120);
