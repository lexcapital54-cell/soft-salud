-- Módulo SG-SST independiente de la gestión documental de habilitación.
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "sgsst_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Los consultorios que hoy ven SG-SST (gestión documental con requisitos SG-SST) lo conservan.
UPDATE "clinics" c
SET "sgsst_enabled" = true
WHERE c."dashboard_type" = 'CLINICAL_HISTORY_WITH_DOCS'
  AND EXISTS (
    SELECT 1
    FROM "document_requirements" r
    JOIN "document_categories" cat ON cat."id" = r."category_id"
    WHERE r."clinic_id" = c."id" AND cat."pillar" = 'SG_SST'
  );
