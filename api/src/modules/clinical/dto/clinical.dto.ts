import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CareModality, DiagnosisType } from '@prisma/client';

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

export class SaveClinicalRecordDto {
  @IsObject()
  content: Record<string, unknown>;

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
