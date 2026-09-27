import { ConsentSignerRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
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
}

export class PublicRemoteSignDto {
  @IsString()
  @MinLength(32)
  signatureBase64: string;
}
