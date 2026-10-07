import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ClinicSpecialty, DashboardType } from '../../common/enums';

export class NewClinicAdminDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  professionalCard?: string;
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

  /** Con o sin gestión documental de habilitación. */
  @IsOptional()
  @IsEnum(DashboardType)
  dashboardType?: DashboardType;

  @IsOptional()
  @IsBoolean()
  sgsstEnabled?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => NewClinicAdminDto)
  admin?: NewClinicAdminDto;
}
