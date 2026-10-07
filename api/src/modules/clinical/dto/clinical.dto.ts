import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
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
import { ORTHO_CONTROL_PROCEDURE_KEYS } from '../ortho-control-procedures';

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

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number;
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

export const ORTHO_CONTROL_EVENTS = ['CONTROL', 'INSTALACION', 'RETIRO', 'RETENCION'] as const;
export type OrthoControlEvent = (typeof ORTHO_CONTROL_EVENTS)[number];

/** Datos estructurados del control de ortodoncia de la sesión. */
export class OrthoControlDto {
  @IsIn(ORTHO_CONTROL_EVENTS as unknown as string[])
  event: OrthoControlEvent;

  @IsOptional() @IsString() @MaxLength(120) phase?: string;
  @IsOptional() @IsString() @MaxLength(120) upperArch?: string;
  @IsOptional() @IsString() @MaxLength(120) lowerArch?: string;
  @IsOptional() @IsString() @MaxLength(200) elastics?: string;
  @IsOptional() @IsString() @MaxLength(300) activations?: string;
  @IsOptional() @IsString() @MaxLength(300) repairs?: string;
  @IsOptional() @IsString() @MaxLength(40) hygiene?: string;
  @IsOptional() @IsString() @MaxLength(40) cooperation?: string;
  @IsOptional() @IsString() @MaxLength(200) ipr?: string;
  @IsOptional() @IsString() @MaxLength(40) pain?: string;
  @IsOptional() @IsString() @MaxLength(300) emergency?: string;
  @IsOptional() @IsString() @MaxLength(200) brackets?: string;
  @IsOptional() @IsString() @MaxLength(120) ligatures?: string;

  /** Procedimientos rápidos marcados; el CUPS se asigna en el servidor. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsIn(ORTHO_CONTROL_PROCEDURE_KEYS, { each: true })
  procedures?: string[];

  /** Foto intraoral frontal del control (adjunto de la historia). */
  @IsOptional()
  @IsUUID()
  photoAttachmentId?: string;

  /** YYYY-MM-DD */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Próxima cita: fecha inválida.' })
  nextAppointment?: string;
}

export const EVOLUTION_AMEND_KINDS = ['CORRECCION', 'ACLARATORIA', 'ANEXO'] as const;
export type EvolutionAmendKind = (typeof EVOLUTION_AMEND_KINDS)[number];

export class CreateEvolutionDto {
  @IsString()
  @MinLength(5)
  note: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => OrthoControlDto)
  orthoControl?: OrthoControlDto;

  /** Evolución original a la que se refiere esta nota (corrección, aclaratoria o anexo). */
  @IsOptional()
  @IsUUID()
  amendsEvolutionId?: string;

  @ValidateIf((o: CreateEvolutionDto) => !!o.amendsEvolutionId)
  @IsIn(EVOLUTION_AMEND_KINDS as unknown as string[])
  amendKind?: EvolutionAmendKind;

  /** Adjuntos que se anexan a la nota. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  attachmentIds?: string[];

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

/** Número de tarjeta profesional (obligatorio: no se borra desde el dashboard). */
export class UpdateProfessionalCardDto {
  @IsString()
  @MinLength(2, { message: 'Escriba el número de tarjeta profesional.' })
  @MaxLength(40)
  @Matches(/^[\p{L}\p{N} .\-/]*$/u, {
    message: 'La tarjeta profesional solo admite letras, números, espacios, punto, guion y barra.',
  })
  professionalCard: string;
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
