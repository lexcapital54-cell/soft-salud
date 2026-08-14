import { Transform, Type } from 'class-transformer';
import { DocumentSignerRole } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
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
