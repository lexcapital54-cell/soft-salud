-- Logos propios de cada consultorio (panel de inicio e historia clínica).
-- Tabla aparte de "clinics": copiar o replicar un consultorio nunca arrastra estos logos.
CREATE TYPE "ClinicLogoKind" AS ENUM ('HOME', 'HC');

CREATE TABLE "clinic_logos" (
  "clinic_id" UUID NOT NULL,
  "kind" "ClinicLogoKind" NOT NULL,
  "mime_type" VARCHAR(40) NOT NULL,
  "data" BYTEA NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinic_logos_pkey" PRIMARY KEY ("clinic_id", "kind"),
  CONSTRAINT "clinic_logos_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
