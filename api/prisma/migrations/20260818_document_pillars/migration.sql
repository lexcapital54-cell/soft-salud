-- Agrupa las categorías documentales en los siete estándares de habilitación
-- (Res. 3100 de 2019) más el pilar de SG-SST (Dec. 1072 de 2015).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentPillar') THEN
    CREATE TYPE "DocumentPillar" AS ENUM (
      'DOCUMENTACION_LEGAL',
      'TALENTO_HUMANO',
      'INFRAESTRUCTURA',
      'DOTACION',
      'MEDICAMENTOS_INSUMOS',
      'PROCESOS_PRIORITARIOS',
      'HISTORIA_CLINICA',
      'INTERDEPENDENCIA',
      'SG_SST'
    );
  END IF;
END $$;

ALTER TABLE "document_categories"
  ADD COLUMN IF NOT EXISTS "pillar" "DocumentPillar" NOT NULL DEFAULT 'PROCESOS_PRIORITARIOS';

-- Reparte las categorías sembradas desde el checklist del consultorio.
UPDATE "document_categories" SET "pillar" = 'DOCUMENTACION_LEGAL'  WHERE "code" = '01_DOCUMENTACION_LEGAL';
UPDATE "document_categories" SET "pillar" = 'TALENTO_HUMANO'       WHERE "code" = '02_TALENTO_HUMANO';
UPDATE "document_categories" SET "pillar" = 'INFRAESTRUCTURA'      WHERE "code" = '03_INFRAESTRUCTURA';
UPDATE "document_categories" SET "pillar" = 'DOTACION'             WHERE "code" = '04_DOTACION';
UPDATE "document_categories" SET "pillar" = 'MEDICAMENTOS_INSUMOS' WHERE "code" IN ('05_MEDICAMENTOS_DISPOSITIVOS', '09_PGIRASA');
UPDATE "document_categories" SET "pillar" = 'PROCESOS_PRIORITARIOS' WHERE "code" IN ('06_PROCESOS_PRIORITARIOS', '08_SEGURIDAD_PACIENTE', '10_EMERGENCIAS', '11_INDICADORES_PAMEC');
UPDATE "document_categories" SET "pillar" = 'HISTORIA_CLINICA'     WHERE "code" = '07_HISTORIA_CLINICA';
UPDATE "document_categories" SET "pillar" = 'INTERDEPENDENCIA'     WHERE "code" = '12_INTERDEPENDENCIA';

CREATE INDEX IF NOT EXISTS "document_categories_pillar_idx" ON "document_categories" ("pillar");
