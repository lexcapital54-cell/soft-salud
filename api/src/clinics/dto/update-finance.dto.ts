import { IsBoolean } from 'class-validator';

export class UpdateFinanceDto {
  @IsBoolean()
  financeEnabled: boolean;
}
