import { AppointmentStatus, CareModality } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class TodayAppointmentsQueryDto {
  /** Nombre o número de documento del paciente */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  /** Día a consultar en formato YYYY-MM-DD; por defecto hoy */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  date?: string;

  /** Rango YYYY-MM-DD para la vista semanal. Si viene, tiene prioridad sobre date. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  to?: string;
}

export class UpdateAppointmentStatusDto {
  @IsEnum(AppointmentStatus)
  status: AppointmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class CreateAppointmentDto {
  @IsUUID()
  patientId: string;

  /** Por defecto, el profesional autenticado */
  @IsOptional()
  @IsUUID()
  professionalId?: string;

  @IsDateString()
  startsAt: string;

  /** Alternativa a endsAt; por defecto 40 minutos */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes?: number;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  /** Fecha de solicitud del paciente; por defecto ahora (indicador de oportunidad) */
  @IsOptional()
  @IsDateString()
  requestDate?: string;

  @IsOptional()
  @IsEnum(CareModality)
  modality?: CareModality;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  meetingUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateAppointmentDto {
  @IsOptional()
  @IsUUID()
  professionalId?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes?: number;

  @IsOptional()
  @IsEnum(CareModality)
  modality?: CareModality;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  meetingUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RegisterAdmissionDto {
  @IsBoolean()
  habeasDataSigned: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  signedByName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  documentNumber?: string;
}
