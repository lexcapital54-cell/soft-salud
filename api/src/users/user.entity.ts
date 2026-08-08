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
  specialty?: ClinicSpecialty | null;
  dashboardType?: DashboardType | null;
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
    specialty: user.clinic?.specialty ?? null,
    dashboardType: user.clinic?.dashboardType ?? null,
    isActive: user.isActive,
  };
}
