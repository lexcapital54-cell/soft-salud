-- Consentimientos CI estructurados (CI-OD-001 / CI-ORT-002 / CI-CIR-003) y revocatoria voluntaria.
ALTER TABLE "patient_consents" ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'ACEPTADO';
ALTER TABLE "patient_consents" ADD COLUMN IF NOT EXISTS "procedure_details" JSONB;
ALTER TABLE "patient_consents" ADD COLUMN IF NOT EXISTS "professional_signature_base64" TEXT;
ALTER TABLE "patient_consents" ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMPTZ(6);
ALTER TABLE "patient_consents" ADD COLUMN IF NOT EXISTS "revocation_reason" TEXT;
ALTER TABLE "patient_consents" ADD COLUMN IF NOT EXISTS "revocation_signer_name" VARCHAR(160);
ALTER TABLE "patient_consents" ADD COLUMN IF NOT EXISTS "revocation_signature_base64" TEXT;
ALTER TABLE "patient_consents" ADD COLUMN IF NOT EXISTS "revocation_ip" VARCHAR(60);
ALTER TABLE "patient_consents" ADD COLUMN IF NOT EXISTS "revocation_user_agent" TEXT;
ALTER TABLE "patient_consents" ADD COLUMN IF NOT EXISTS "revocation_hash" VARCHAR(128);
ALTER TABLE "patient_consents" ADD COLUMN IF NOT EXISTS "revocation_pdf_storage_key" TEXT;

ALTER TABLE "remote_consent_invites" ADD COLUMN IF NOT EXISTS "procedure_details" JSONB;
