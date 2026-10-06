-- Hoja membretada opcional por consultorio (fondo del PDF de la historia clínica).
ALTER TYPE "ClinicLogoKind" ADD VALUE IF NOT EXISTS 'LETTERHEAD';
