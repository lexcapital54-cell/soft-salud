import { IsEmail, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateClinicAdminDto {
  @IsUUID()
  clinicId: string;

  @IsString()
  @MinLength(2)
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
