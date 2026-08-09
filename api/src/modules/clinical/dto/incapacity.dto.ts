import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateIncapacityDto {
  @IsUUID()
  encounterId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsInt()
  @Min(1)
  days: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  diagnosisCie?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  cause?: string;

  @IsOptional()
  @IsString()
  observations?: string;
}

export class UpdateIncapacityDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  days?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  diagnosisCie?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  cause?: string | null;

  @IsOptional()
  @IsString()
  observations?: string | null;
}

export class SignIncapacityDto {
  /** Firma recién dibujada. Si se omite se usa la guardada en el perfil. */
  @IsOptional()
  @IsString()
  signatureBase64?: string;
}
