import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CareModality,
  ClinicalNoteFormat,
  DiagnosisType,
} from '@prisma/client';

/** Filtros del calendario de historias por fecha. */
export class ListEncountersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  to?: string;

  @IsOptional()
  @IsUUID()
  patientId?: string;
}

export class CreateEncounterDto {
  @IsUUID()
  patientId: string;

  @IsOptional()
  @IsEnum(CareModality)
  modality?: CareModality;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  serviceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  externalCause?: string;
}

export class DiagnosisInputDto {
  @IsString()
  @MaxLength(20)
  cieCode: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsEnum(DiagnosisType)
  type?: DiagnosisType;
}

export class ProcedureInputDto {
  @IsString()
  @MaxLength(20)
  cupsCode: string;

  @IsString()
  description: string;
}

export class ConsentInputDto {
  @IsString()
  @MaxLength(60)
  consentType: string;

  @IsBoolean()
  granted: boolean;

  @IsOptional()
  @IsString()
  grantedAt?: string;
}

export class SignClinicalRecordDto {
  /** Firma recién dibujada. Si se omite se usa la guardada en el perfil. */
  @IsOptional()
  @IsString()
  signatureBase64?: string;
}

export class CreateEvolutionDto {
  @IsString()
  @MinLength(5)
  note: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  reason?: string;

  @IsOptional()
  @IsString()
  signatureBase64?: string;
}

export class UpdateProfessionalSignatureDto {
  @IsString()
  signatureBase64: string;
}

export class SaveClinicalRecordDto {
  @IsObject()
  content: Record<string, unknown>;

  @IsOptional()
  @IsEnum(ClinicalNoteFormat)
  noteFormat?: ClinicalNoteFormat;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiagnosisInputDto)
  diagnoses?: DiagnosisInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProcedureInputDto)
  procedures?: ProcedureInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsentInputDto)
  consents?: ConsentInputDto[];

  @IsOptional()
  @IsEnum(CareModality)
  modality?: CareModality;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  serviceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  externalCause?: string;
}
