-- El recetario sale de la historia clínica: se eliminan las prescripciones y el
-- catálogo IUM, que solo existía para alimentarlas.
DROP TABLE IF EXISTS "prescription_items";
DROP TABLE IF EXISTS "prescriptions";
DROP TABLE IF EXISTS "ium_medications";

DROP TYPE IF EXISTS "PrescriptionKind";
