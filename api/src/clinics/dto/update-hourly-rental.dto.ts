import { IsBoolean } from 'class-validator';

export class UpdateHourlyRentalDto {
  @IsBoolean()
  hourlyRentalEnabled: boolean;
}
