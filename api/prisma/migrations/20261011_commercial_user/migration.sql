-- Usuario comercial de HABILISALUD (solo lectura de consultorios demo).
INSERT INTO "users" ("id", "email", "password_hash", "password_reminder", "full_name", "role", "is_active", "created_at", "updated_at")
VALUES (
  '1fd40aff-68d5-4381-bc19-cc72ef29560a',
  'comercial@habilisalud.com',
  '$2b$10$7gyjB7lPXM/c1Qqcmebo2OUrJlZeC.9Sf406OeRTPhe7Wbwd.zheS',
  '2020',
  'Comercial HABILISALUD',
  'COMMERCIAL',
  true,
  now(),
  now()
)
ON CONFLICT ("email") DO NOTHING;
