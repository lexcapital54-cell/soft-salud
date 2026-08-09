import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ClinicSpecialty } from '../../common/enums';

export class NewClinicAdminDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export class CreateClinicDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEnum(ClinicSpecialty)
  specialty: ClinicSpecialty;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NewClinicAdminDto)
  admin?: NewClinicAdminDto;
}
