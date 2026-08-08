import {
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
}
