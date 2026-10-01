import { ConsentSignerRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePatientConsentDto {
  @IsUUID()
  patientId: string;

  @IsUUID()
  templateId: string;

  @IsOptional()
  @IsUUID()
  encounterId?: string;

  @IsOptional()
  @IsEnum(ConsentSignerRole)
  signerRole?: ConsentSignerRole;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  signerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  signerDocumentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  signerDocument?: string;

  @IsString()
  @MinLength(32)
  signatureBase64: string;

  @IsOptional()
  @IsString()
  @MinLength(32)
  professionalSignatureBase64?: string;

  /** Detalle CI (dientes, opciones, riesgos); se valida contra la plantilla. */
  @IsOptional()
  @IsObject()
  procedureDetails?: Record<string, unknown>;
}

export class RevokePatientConsentDto {
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  signerName?: string;

  @IsString()
  @MinLength(32)
  signatureBase64: string;
}

export class SendRemoteConsentInviteDto {
  @IsUUID()
  patientId: string;

  @IsUUID()
  templateId: string;

  @IsUUID()
  encounterId: string;

  @IsOptional()
  @IsEmail()
  emailOverride?: string;

  /** Teléfono para abrir WhatsApp (wa.me). Si no viene, se usa el de la ficha. */
  @IsOptional()
  @IsString()
  phoneOverride?: string;

  @IsOptional()
  @IsObject()
  procedureDetails?: Record<string, unknown>;
}

export class PublicRemoteSignDto {
  @IsString()
  @MinLength(32)
  signatureBase64: string;
}
