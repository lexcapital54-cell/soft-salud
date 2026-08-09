import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class SivigilaQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cieCode?: string;
}
