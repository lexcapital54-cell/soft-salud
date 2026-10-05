import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Datos sin columna propia (ficha de ingreso de psicología); se guardan en Patient.extras. */
export class PatientExtrasDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  birthPlace?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  neighborhood?: string;

  @IsOptional()
  @IsIn(['', '1', '2', '3', '4', '5', '6'])
  stratum?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  religion?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  otherSpecialtyCare?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  otherSpecialtyDetail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  currentMedications?: string;
}

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
  profession?: string;

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

  /** Representante legal / acudiente (obligatorio en UI si menor de 18). */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  guardianFullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  guardianDocumentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  guardianDocumentNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  guardianRelationship?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  guardianPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  guardianEmail?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PatientExtrasDto)
  extras?: PatientExtrasDto;
}

export class UpdatePatientDto extends PartialType(CreatePatientDto) {}

/** Alta completa desde la agenda (psicología); el servicio exige tipo y número de documento. */
export class IntakePatientDto extends CreatePatientDto {}

/** Plan de tratamiento o indicaciones odontológicas enviadas al paciente. */
export class DentalInstructionsDto {
  @IsIn(['EMAIL', 'WHATSAPP'])
  channel: 'EMAIL' | 'WHATSAPP';

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;

  @IsString()
  @MinLength(5)
  @MaxLength(6000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  encounterId?: string;
}
