-- Doble firma de aprobación: HABILISALUD (superadmin) → CLINIC_ADMIN (admin consultorio).
ALTER TYPE "DocumentSignerRole" ADD VALUE IF NOT EXISTS 'HABILISALUD';
ALTER TYPE "DocumentSignerRole" ADD VALUE IF NOT EXISTS 'CLINIC_ADMIN';
