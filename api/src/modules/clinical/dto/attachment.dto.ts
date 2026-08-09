import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AttachmentCategory } from '@prisma/client';

export class UploadAttachmentMetaDto {
  @IsUUID()
  encounterId: string;

  @IsOptional()
  @IsUUID()
  clinicalRecordId?: string;

  @IsString()
  @MaxLength(160)
  label: string;

  @IsOptional()
  @IsEnum(AttachmentCategory)
  category?: AttachmentCategory;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  caption?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
