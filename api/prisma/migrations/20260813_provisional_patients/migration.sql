-- Registro rápido desde la agenda: la ficha se abre con nombre y teléfono y se
-- completa cuando el paciente asiste a consulta. Documento y fecha de nacimiento
-- pasan a ser opcionales; la unicidad por documento se mantiene porque Postgres
-- trata cada NULL como distinto.
ALTER TABLE "patients" ALTER COLUMN "document_type" DROP NOT NULL;
ALTER TABLE "patients" ALTER COLUMN "document_number" DROP NOT NULL;
ALTER TABLE "patients" ALTER COLUMN "birth_date" DROP NOT NULL;
