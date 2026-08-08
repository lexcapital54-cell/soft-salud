import { PartialType } from '@nestjs/mapped-types';
import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePatientDto {
  @IsString()
  @MaxLength(20)
  documentType: string;

  @IsString()
  @MaxLength(40)
  documentNumber: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  middleName?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  secondLastName?: string;

  @IsDateString()
  birthDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  sexAtBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  genderIdentity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sexualOrientation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  eps?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  regime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  affiliationNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  occupation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  educationLevel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  emergencyRelationship?: string;
}

export class UpdatePatientDto extends PartialType(CreatePatientDto) {}
