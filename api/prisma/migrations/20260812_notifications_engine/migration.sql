-- Módulo 1: motor de notificaciones multicanal (WhatsApp / Email)
-- + medios de pago colombianos (Módulo 3) + autorización de contacto (Ley 1581).
-- Migración idempotente: puede reejecutarse sin romper bases ya parcheadas.

-- ─── Enums del motor de notificaciones ──────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP', 'EMAIL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationKind" AS ENUM (
    'REMINDER_24H',
    'REMINDER_2H',
    'CONFIRMATION',
    'CANCELLATION',
    'MANUAL_RESEND'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Medios de pago (Res. 2275 / tesorería) ─────────────────────────────────
-- Se insertan antes de OTHER para conservar el orden del enum en Prisma.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'PSE' BEFORE 'OTHER';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'NEQUI' BEFORE 'OTHER';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'DAVIPLATA' BEFORE 'OTHER';

-- ─── Autorización de contacto por canal (Ley 1581, revocable) ───────────────
ALTER TABLE "patients"
  ADD COLUMN IF NOT EXISTS "notify_by_whatsapp" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "patients"
  ADD COLUMN IF NOT EXISTS "notify_by_email" BOOLEAN NOT NULL DEFAULT true;

-- ─── Bitácora de notificaciones ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "notification_logs" (
  "id"                  UUID           NOT NULL,
  "clinic_id"           UUID           NOT NULL,
  "appointment_id"      UUID,
  "patient_id"          UUID           NOT NULL,
  "channel"             "NotificationChannel" NOT NULL,
  "kind"                "NotificationKind"    NOT NULL,
  "status"              "NotificationStatus"  NOT NULL DEFAULT 'PENDING',
  "destination"         VARCHAR(180)   NOT NULL,
  "template_code"       VARCHAR(60),
  "payload"             JSONB,
  "provider_message_id" VARCHAR(120),
  "error_message"       TEXT,
  "attempts"            INTEGER        NOT NULL DEFAULT 0,
  "scheduled_for"       TIMESTAMPTZ(6),
  "sent_at"             TIMESTAMPTZ(6),
  "triggered_by_id"     UUID,
  "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "notification_logs"
    ADD CONSTRAINT "notification_logs_clinic_id_fkey"
    FOREIGN KEY ("clinic_id") REFERENCES "clinics" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "notification_logs"
    ADD CONSTRAINT "notification_logs_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "notification_logs"
    ADD CONSTRAINT "notification_logs_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "notification_logs"
    ADD CONSTRAINT "notification_logs_triggered_by_id_fkey"
    FOREIGN KEY ("triggered_by_id") REFERENCES "users" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Idempotencia del cron (cada 10 min): un recordatorio por cita, tipo y canal.
CREATE UNIQUE INDEX IF NOT EXISTS "notification_logs_appointment_id_kind_channel_key"
  ON "notification_logs" ("appointment_id", "kind", "channel");

CREATE INDEX IF NOT EXISTS "notification_logs_clinic_id_created_at_idx"
  ON "notification_logs" ("clinic_id", "created_at");

CREATE INDEX IF NOT EXISTS "notification_logs_status_scheduled_for_idx"
  ON "notification_logs" ("status", "scheduled_for");
