-- Firma remota por WhatsApp: teléfono destino + correo opcional.
ALTER TABLE "remote_consent_invites"
  ALTER COLUMN "sent_to_email" DROP NOT NULL;

ALTER TABLE "remote_consent_invites"
  ADD COLUMN IF NOT EXISTS "sent_to_phone" VARCHAR(40);
