import { DocumentSignerRole } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class FillSgsstSignatureDto {
  @IsEnum(DocumentSignerRole)
  role!: DocumentSignerRole;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  signerName!: string;

  /** Data URL de la imagen de firma (PNG/JPG). */
  @IsString()
  @MinLength(40)
  signatureBase64!: string;
}

/**
 * Diligenciamiento de cualquier documento del pilar SG-SST.
 * Las firmas imagen se pegan bajo la etiqueta "Firma …" de cada rol.
 */
export class FillSgsstDto {
  @IsString()
  @MinLength(8)
  @MaxLength(40)
  fecha!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  periodLabel?: string;

  /** Contenido / observaciones que llenan las líneas punteadas. */
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  contenido?: string;

  /** Campos opcionales usados en actas de capacitación. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  tema?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  objetivo?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FillSgsstSignatureDto)
  signatures!: FillSgsstSignatureDto[];
}
