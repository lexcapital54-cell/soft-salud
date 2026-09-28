import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClinicSpecialty, DashboardType } from '../common/enums';
import { UserClinicAccess } from '../users/user-clinic-access.entity';
import { User } from '../users/user.entity';

@Entity('clinics')
export class Clinic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 160 })
  name: string;

  @Column({ type: 'enum', enum: ClinicSpecialty })
  specialty: ClinicSpecialty;

  @Column({
    name: 'dashboard_type',
    type: 'enum',
    enum: DashboardType,
    nullable: true,
  })
  dashboardType: DashboardType | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  nit: string | null;

  @Column({ name: 'habilitation_code', type: 'varchar', length: 20, nullable: true })
  habilitationCode: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'hosting_period_due', type: 'date', nullable: true })
  hostingPeriodDue: Date | null;

  @Column({ name: 'hosting_suspended_at', type: 'timestamptz', nullable: true })
  hostingSuspendedAt: Date | null;

  @Column({ name: 'hosting_due_notified_at', type: 'timestamptz', nullable: true })
  hostingDueNotifiedAt: Date | null;

  @OneToMany(() => User, (user) => user.clinic)
  admins: User[];

  @OneToMany(() => UserClinicAccess, (access) => access.clinic)
  userAccess: UserClinicAccess[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
