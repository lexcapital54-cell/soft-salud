import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { HourlyBookingStatus } from '@prisma/client';

/** Alta rápida de profesional con plan de arriendo (desde el calendario). */
export class CreateHourlyProfessionalDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName: string;

  @IsEmail()
  email: string;

  /** Si no se envía, se genera una clave temporal de 8 caracteres. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  professionalCard?: string;
}

export class UpdateHourlyRentalSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  hourlyMaxConcurrentRooms?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  hourlyMaxHoursPerMonth?: number;
}

export class UpsertClinicRoomDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateHourlyBookingDto {
  @IsUUID()
  professionalId: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateHourlyBookingDto {
  @IsOptional()
  @IsUUID()
  roomId?: string | null;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsEnum(HourlyBookingStatus)
  status?: HourlyBookingStatus;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
