import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';

/** Fecha vacía o AAAA-MM-DD. */
const DATE = /^(\d{4}-\d{2}-\d{2})?$/;
export const PSYCH_REPORT_TEXT_MAX = 20000;

export class PsychReportPatientDto {
  @IsString() @MaxLength(160) fullName: string;
  @IsString() @MaxLength(60) documentType: string;
  @IsString() @MaxLength(40) documentNumber: string;
  @IsString() @MaxLength(30) age: string;
  @IsString() @Matches(DATE) birthDate: string;
  @IsString() @MaxLength(40) phone: string;
  @IsString() @MaxLength(200) institution: string;
}

export class PsychReportProfessionalDto {
  @IsString() @MaxLength(160) fullName: string;
  @IsString() @MaxLength(160) title: string;
  @IsString() @MaxLength(80) card: string;
}

export class PsychReportDataDto {
  @IsString() @MaxLength(160) clinicName: string;
  @IsString() @MaxLength(40) reportNumber: string;
  @IsString() @Matches(DATE) issuedAt: string;

  @ValidateNested() @Type(() => PsychReportPatientDto)
  patient: PsychReportPatientDto;

  @IsString() @MaxLength(PSYCH_REPORT_TEXT_MAX) reason: string;
  @IsString() @MaxLength(PSYCH_REPORT_TEXT_MAX) findings: string;
  @IsString() @MaxLength(PSYCH_REPORT_TEXT_MAX) conclusions: string;

  @ValidateNested() @Type(() => PsychReportProfessionalDto)
  professional: PsychReportProfessionalDto;
}

/** Llega como texto JSON en el campo `payload` del formulario multipart (junto a la firma). */
export class SavePsychReportDto {
  @IsOptional() @IsUUID() patientId?: string | null;

  @ValidateNested() @Type(() => PsychReportDataDto)
  data: PsychReportDataDto;

  /** true: quitar la firma guardada (si no se envía una nueva). */
  @IsOptional() @IsBoolean() removeSignature?: boolean;
}

export class RenderPsychReportDto {
  @ValidateNested() @Type(() => PsychReportDataDto)
  data: PsychReportDataDto;

  /** true: el profesional quitó la firma a propósito (firma a mano); no se agrega la registrada. */
  @IsOptional() @IsBoolean() withoutSignature?: boolean;
}

export type PsychReportData = PsychReportDataDto;
