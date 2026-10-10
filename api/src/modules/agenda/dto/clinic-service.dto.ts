import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class SaveClinicServiceDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsIn(['FACIAL', 'CORPORAL', 'OTRO'])
  category!: 'FACIAL' | 'CORPORAL' | 'OTRO';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  subcategory?: string;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  durationNote?: string;

  /** Null = precio a consultar. */
  @IsOptional()
  @ValidateIf((o: SaveClinicServiceDto) => o.price !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999)
  price?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  procedureType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  consentCode?: string;

  @IsOptional()
  @IsBoolean()
  assistantService?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
