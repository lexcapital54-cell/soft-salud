import { IsArray, IsUUID } from 'class-validator';

export class SwitchClinicDto {
  @IsUUID()
  clinicId: string;
}

export class SetUserClinicAccessDto {
  @IsArray()
  @IsUUID('4', { each: true })
  clinicIds: string[];
}

export class GrantSelfClinicDto {
  @IsUUID()
  clinicId: string;
}
