import { IsBoolean } from 'class-validator';

export class UpdateSgsstDto {
  @IsBoolean()
  sgsstEnabled: boolean;
}
