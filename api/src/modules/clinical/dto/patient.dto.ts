import { PartialType } from '@nestjs/mapped-types';
import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Registro rápido desde la agenda: lo mínimo para poder llamar al paciente. */
export class QuickPatientDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName: string;

  @IsString()
  @MinLength(7)
  @MaxLength(40)
  phone: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  email?: string;

  /// Si la recepción ya tiene la cédula, la ficha nace identificada.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  documentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  documentNumber?: string;
}

export class CreatePatientDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  documentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  documentNumber?: string;

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

  @IsOptional()
  @IsDateString()
  birthDate?: string;

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

  /** Código DIVIPOLA de 5 dígitos del municipio de residencia (RIPS). */
  @IsOptional()
  @IsString()
  @MaxLength(5)
  municipalityCode?: string;

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
