-- Plan del profesional (mensualidad fija vs arriendo por horas) + salas y reservas.
-- Cambios aditivos: no borra ni altera datos clínicos existentes.

CREATE TYPE "users_membership_type_enum" AS ENUM ('MONTHLY_FIXED', 'HOURLY_RENTAL');
CREATE TYPE "hourly_bookings_status_enum" AS ENUM ('CONFIRMED', 'CANCELLED', 'IN_PROGRESS', 'COMPLETED');

-- 1) Tipo de plan en users (antes "professionals" en el boceto). Default = mensualidad fija.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "membership_type" "users_membership_type_enum" NOT NULL DEFAULT 'MONTHLY_FIXED';

CREATE INDEX IF NOT EXISTS "users_clinic_id_membership_type_idx"
  ON "users"("clinic_id", "membership_type");

-- 2) Salas / boxes del consultorio (el boceto tenía room_id suelto; aquí va con FK).
CREATE TABLE IF NOT EXISTS "clinic_rooms" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "code" VARCHAR(40),
  "capacity" INTEGER NOT NULL DEFAULT 1,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "clinic_rooms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "clinic_rooms_clinic_id_name_key" ON "clinic_rooms"("clinic_id", "name");
CREATE INDEX IF NOT EXISTS "clinic_rooms_clinic_id_is_active_idx" ON "clinic_rooms"("clinic_id", "is_active");

DO $$ BEGIN
  ALTER TABLE "clinic_rooms"
    ADD CONSTRAINT "clinic_rooms_clinic_id_fkey"
    FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) Reservas / bloques de horas.
CREATE TABLE IF NOT EXISTS "hourly_bookings" (
  "id" UUID NOT NULL,
  "clinic_id" UUID NOT NULL,
  "professional_id" UUID NOT NULL,
  "room_id" UUID,
  "start_time" TIMESTAMPTZ(6) NOT NULL,
  "end_time" TIMESTAMPTZ(6) NOT NULL,
  "status" "hourly_bookings_status_enum" NOT NULL DEFAULT 'CONFIRMED',
  "notes" TEXT,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "hourly_bookings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "hourly_bookings_clinic_id_start_time_idx" ON "hourly_bookings"("clinic_id", "start_time");
CREATE INDEX IF NOT EXISTS "hourly_bookings_professional_id_start_time_idx" ON "hourly_bookings"("professional_id", "start_time");
CREATE INDEX IF NOT EXISTS "hourly_bookings_room_id_start_time_idx" ON "hourly_bookings"("room_id", "start_time");
CREATE INDEX IF NOT EXISTS "hourly_bookings_status_start_time_idx" ON "hourly_bookings"("status", "start_time");

DO $$ BEGIN
  ALTER TABLE "hourly_bookings"
    ADD CONSTRAINT "hourly_bookings_clinic_id_fkey"
    FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "hourly_bookings"
    ADD CONSTRAINT "hourly_bookings_professional_id_fkey"
    FOREIGN KEY ("professional_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "hourly_bookings"
    ADD CONSTRAINT "hourly_bookings_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "clinic_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "hourly_bookings"
    ADD CONSTRAINT "hourly_bookings_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4) Vínculo opcional historia clínica ↔ reserva (null = mensualidad fija / sin reserva).
ALTER TABLE "clinical_records"
  ADD COLUMN IF NOT EXISTS "booking_id" UUID;

CREATE INDEX IF NOT EXISTS "clinical_records_booking_id_idx" ON "clinical_records"("booking_id");

DO $$ BEGIN
  ALTER TABLE "clinical_records"
    ADD CONSTRAINT "clinical_records_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "hourly_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
