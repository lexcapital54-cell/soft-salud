import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SaveAgendaStaffDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  roleLabel?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'La hora de entrada debe tener formato HH:MM.' })
  shiftStart?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'La hora de salida debe tener formato HH:MM.' })
  shiftEnd?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
