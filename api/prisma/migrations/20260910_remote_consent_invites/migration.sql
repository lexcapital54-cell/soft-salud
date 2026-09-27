-- Firma remota por correo (atención virtual), caducidad 7 días.
CREATE TABLE IF NOT EXISTS "remote_consent_invites" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinic_id" UUID NOT NULL,
  "patient_id" UUID NOT NULL,
  "encounter_id" UUID,
  "template_id" UUID NOT NULL,
  "invited_by_id" UUID NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "sent_to_email" VARCHAR(180) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "patient_consent_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "remote_consent_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "remote_consent_invites_token_hash_key"
  ON "remote_consent_invites"("token_hash");
CREATE INDEX IF NOT EXISTS "remote_consent_invites_clinic_id_status_idx"
  ON "remote_consent_invites"("clinic_id", "status");
CREATE INDEX IF NOT EXISTS "remote_consent_invites_patient_id_created_at_idx"
  ON "remote_consent_invites"("patient_id", "created_at");
CREATE INDEX IF NOT EXISTS "remote_consent_invites_expires_at_idx"
  ON "remote_consent_invites"("expires_at");

ALTER TABLE "remote_consent_invites"
  ADD CONSTRAINT "remote_consent_invites_clinic_id_fkey"
  FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "remote_consent_invites"
  ADD CONSTRAINT "remote_consent_invites_patient_id_fkey"
  FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "remote_consent_invites"
  ADD CONSTRAINT "remote_consent_invites_encounter_id_fkey"
  FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "remote_consent_invites"
  ADD CONSTRAINT "remote_consent_invites_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "consent_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "remote_consent_invites"
  ADD CONSTRAINT "remote_consent_invites_invited_by_id_fkey"
  FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
