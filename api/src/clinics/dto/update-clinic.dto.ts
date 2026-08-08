import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ClinicSpecialty } from '../../common/enums';

export class UpdateClinicDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEnum(ClinicSpecialty)
  specialty?: ClinicSpecialty;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
