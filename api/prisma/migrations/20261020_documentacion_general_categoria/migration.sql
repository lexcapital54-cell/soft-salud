-- Tipo documental base del grupo «0. Documentación general» (va en migración
-- aparte: Postgres no permite usar un valor de enum en la misma transacción que lo crea).
INSERT INTO "document_categories" ("id", "code", "name", "pillar", "sort_order", "is_active")
VALUES (gen_random_uuid(), 'GEN_00_GENERAL', '0. Documentación general', 'DOCUMENTACION_GENERAL', 0, true)
ON CONFLICT ("code") DO NOTHING;
