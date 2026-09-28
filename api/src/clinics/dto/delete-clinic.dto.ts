import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class DeleteClinicDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  confirmName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'La clave de confirmación debe tener 4 dígitos.' })
  confirmPin?: string;
}
