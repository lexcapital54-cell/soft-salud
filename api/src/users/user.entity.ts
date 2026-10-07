import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClinicSpecialty, DashboardType, UserRole } from '../common/enums';
import { Clinic } from '../clinics/clinic.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 180 })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  /** Última clave asignada por SUPER_ADMIN; no se usa para login. */
  @Column({ name: 'password_reminder', type: 'varchar', length: 72, nullable: true })
  passwordReminder: string | null;

  @Column({ name: 'full_name', length: 160 })
  fullName: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @ManyToOne(() => Clinic, (clinic) => clinic.admins, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'clinic_id' })
  clinic: Clinic | null;

  @Column({ name: 'clinic_id', type: 'uuid', nullable: true })
  clinicId: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'professional_card', type: 'varchar', length: 80, nullable: true })
  professionalCard: string | null;

  @Column({ name: 'professional_signature_base64', type: 'text', nullable: true })
  professionalSignatureBase64: string | null;

  @Column({ name: 'rips_enabled', default: false })
  ripsEnabled: boolean;

  @Column({ name: 'reps_expiration_date', type: 'date', nullable: true })
  repsExpirationDate: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

export type PublicUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  clinicId: string | null;
  clinicName?: string | null;
  clinicAddress?: string | null;
  clinicPhone?: string | null;
  specialty?: ClinicSpecialty | null;
  dashboardType?: DashboardType | null;
  sgsstEnabled?: boolean;
  ripsEnabled?: boolean;
  repsExpirationDate?: string | null;
  isActive: boolean;
};

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    clinicId: user.clinicId,
    clinicName: user.clinic?.name ?? null,
    clinicAddress: user.clinic?.address ?? null,
    clinicPhone: user.clinic?.phone ?? null,
    specialty: user.clinic?.specialty ?? null,
    dashboardType: user.clinic?.dashboardType ?? null,
    sgsstEnabled: user.clinic?.sgsstEnabled ?? false,
    ripsEnabled: user.ripsEnabled ?? false,
    repsExpirationDate: user.repsExpirationDate
      ? typeof user.repsExpirationDate === 'string'
        ? String(user.repsExpirationDate).slice(0, 10)
        : [
            user.repsExpirationDate.getUTCFullYear(),
            String(user.repsExpirationDate.getUTCMonth() + 1).padStart(2, '0'),
            String(user.repsExpirationDate.getUTCDate()).padStart(2, '0'),
          ].join('-')
      : null,
    isActive: user.isActive,
  };
}
