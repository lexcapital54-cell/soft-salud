import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
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

/** Corrección de fecha de digitación / modalidad (también en HC sellada, auditada). */
export class UpdateAttendanceMetaDto {
  @IsOptional()
  @IsEnum(CareModality)
  modality?: CareModality;

  @IsOptional()
  @IsDateString()
  documentedAt?: string;
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

/** Actualiza solo CIE-10 (permite completar codificación con la HC ya sellada). */
export class UpdateDiagnosesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiagnosisInputDto)
  diagnoses: DiagnosisInputDto[];
}

/** Actualiza solo procedimientos CUPS (consultas, psicoterapias, remisiones). */
export class UpdateProceduresDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProcedureInputDto)
  procedures: ProcedureInputDto[];
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

  /** Situación actual del paciente (se hereda a la siguiente evolución). */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  currentSituation?: string;

  /** fecha_atencion_clinica (ISO). Si falta, se usa la fecha de firma. */
  @IsOptional()
  @IsDateString()
  clinicalAttentionDate?: string;

  @IsOptional()
  @IsString()
  signatureBase64?: string;
}

export class UpdateProfessionalSignatureDto {
  @IsString()
  signatureBase64: string;
}

export class UpdateRipsSettingsDto {
  @IsBoolean()
  ripsEnabled: boolean;
}

/** Vencimiento del registro REPS del profesional (User.repsExpirationDate). */
export class UpdateRepsSettingsDto {
  /** YYYY-MM-DD, o null/vacío para limpiar. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  repsExpirationDate?: string | null;
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

  /** Generar JSON RIPS para esta atención (si el profesional tiene RIPS activo). */
  @IsOptional()
  @IsBoolean()
  generateRips?: boolean;

  /** true cuando el guardado viene del autoguardado (debounce) del frontend. */
  @IsOptional()
  @IsBoolean()
  autosave?: boolean;
}
