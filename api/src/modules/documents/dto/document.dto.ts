import { Transform, Type } from 'class-transformer';
import { DocumentSignerRole } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
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

export class SignDocumentDto {
  @IsEnum(DocumentSignerRole)
  role!: DocumentSignerRole;

  /** Data URL o base64 puro de la firma dibujada. */
  @IsString()
  @MinLength(40)
  signatureBase64!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  signerName?: string;
}

export class UpdateDocumentMetaDto {
  @IsOptional()
  @IsString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  periodLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/** Metadatos opcionales al subir un archivo (multipart). */
export class UploadDocumentMetaDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  periodLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  issuedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeReason?: string;
}

export class SetRequirementEnabledDto {
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  enabled!: boolean;
}

export class SetAllRequirementsEnabledDto {
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  enabled!: boolean;
}

export class SetRequirementClinicSignatureDto {
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  requiresClinicSignature!: boolean;
}

export class CreateDocumentRequirementDto {
  @IsString()
  @MinLength(2)
  categoryId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === undefined)
  @IsBoolean()
  isMandatory?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  requiresClinicSignature?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  responsibleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  responsibleArea?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  validityDays?: number;
}

export class ReplicateDocumentsDto {
  @IsUUID()
  sourceClinicId!: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  targetClinicIds?: string[];

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === undefined)
  @IsBoolean()
  includeFiles?: boolean;
}

/** SUPER_ADMIN: asigna un subconjunto del catálogo al consultorio. */
export class AssignDocumentRequirementsDto {
  /** Códigos de requisito a dejar activos en el consultorio. */
  @IsArray()
  @IsString({ each: true })
  codes!: string[];

  /**
   * Si es true (default), deshabilita los requisitos del consultorio
   * cuyo código no esté en `codes` (no borra archivos).
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === undefined)
  @IsBoolean()
  syncDisabled?: boolean;

  /**
   * Consultorio del que tomar título/categoría de cada código
   * (por defecto: el más completo de la misma especialidad).
   */
  @IsOptional()
  @IsUUID()
  sourceClinicId?: string;
}
