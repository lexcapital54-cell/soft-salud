import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const ATTENDANCE_MODALITIES = ['', 'PRESENCIAL', 'VIRTUAL'] as const;
export const ATTENDANCE_STATUSES = ['', 'ASIGNADA', 'ASISTIO', 'NO_ASISTIO', 'REPROGRAMADA'] as const;
export const ATTENDANCE_MAX_ROWS = 120;

/** Fecha vacía o AAAA-MM-DD; hora vacía o HH:MM (24 h). */
const DATE = /^(\d{4}-\d{2}-\d{2})?$/;
const TIME = /^(\d{2}:\d{2})?$/;

export class AttendanceGeneralDto {
  @IsString() @MaxLength(160) userName: string;
  @IsString() @MaxLength(120) identification: string;
  @IsString() @MaxLength(160) professional: string;
  @IsString() @MaxLength(200) site: string;
}

export class AttendanceRowDto {
  @IsString() @Matches(DATE) date: string;
  @IsString() @Matches(TIME) time: string;
  @IsIn(ATTENDANCE_MODALITIES) modality: (typeof ATTENDANCE_MODALITIES)[number];
  @IsIn(ATTENDANCE_STATUSES) status: (typeof ATTENDANCE_STATUSES)[number];
  @IsString() @Matches(DATE) nextDate: string;
}

export class AttendanceCertificateDto {
  @IsBoolean() assigned: boolean;
  @IsBoolean() attended: boolean;
  @IsString() @Matches(DATE) date: string;
  @IsString() @Matches(TIME) time: string;
  @IsString() @MaxLength(300) place: string;
  @IsString() @Matches(DATE) issuedAt: string;
  @IsString() @MaxLength(160) responsible: string;
}

export class AttendanceControlDataDto {
  @IsString() @MaxLength(160) clinicName: string;
  @IsString() @Matches(DATE) registeredAt: string;

  @ValidateNested() @Type(() => AttendanceGeneralDto)
  general: AttendanceGeneralDto;

  @IsArray()
  @ArrayMaxSize(ATTENDANCE_MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => AttendanceRowDto)
  rows: AttendanceRowDto[];

  @ValidateNested() @Type(() => AttendanceCertificateDto)
  certificate: AttendanceCertificateDto;

  @IsString() @MaxLength(3000) notes: string;
}

export class SaveAttendanceControlDto {
  @IsOptional() @IsUUID() patientId?: string | null;

  @ValidateNested() @Type(() => AttendanceControlDataDto)
  data: AttendanceControlDataDto;
}

export class RenderAttendanceControlDto {
  @ValidateNested() @Type(() => AttendanceControlDataDto)
  data: AttendanceControlDataDto;
}

export type AttendanceControlData = AttendanceControlDataDto;
