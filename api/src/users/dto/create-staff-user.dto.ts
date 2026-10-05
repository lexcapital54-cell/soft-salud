import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../common/enums';

/** Roles que SUPER_ADMIN puede crear en un consultorio. */
export const STAFF_CREATABLE_ROLES = [
  UserRole.ADMIN,
  UserRole.HEALTH_PROFESSIONAL,
  UserRole.RECEPTIONIST, UserRole.AUXILIAR,
  UserRole.AUDITOR,
] as const;

export class CreateStaffUserDto {
  @IsUUID()
  clinicId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  professionalCard?: string;
}

export class ResetUserPasswordDto {
  @IsString()
  @MinLength(4)
  @MaxLength(72)
  password!: string;
}

export class UpdateStaffUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  professionalCard?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
