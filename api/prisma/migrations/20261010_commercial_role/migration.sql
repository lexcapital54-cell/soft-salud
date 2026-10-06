-- Perfil comercial: solo consulta los consultorios demo.
ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'COMMERCIAL';
