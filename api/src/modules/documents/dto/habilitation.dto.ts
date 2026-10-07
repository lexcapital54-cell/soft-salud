import { Transform, Type } from 'class-transformer';
import { DocumentPillar } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateHabilitationDocumentDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

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

  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;
}

export class UpdateHabilitationDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  responsibleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  responsibleArea?: string;

  /** null o 0 = sin vigencia automática. */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? null : Number(value)))
  @IsInt()
  @Min(0)
  @Max(3650)
  validityDays?: number | null;
}

export class SetArchivedDto {
  @IsBoolean()
  archived!: boolean;
}

export class CreateDocumentCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsEnum(DocumentPillar)
  pillar!: DocumentPillar;
}

export class UpdateDocumentCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsEnum(DocumentPillar)
  pillar?: DocumentPillar;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
