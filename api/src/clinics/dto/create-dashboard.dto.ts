import { IsEnum } from 'class-validator';
import { DashboardType } from '../../common/enums';

export class CreateDashboardDto {
  @IsEnum(DashboardType)
  dashboardType: DashboardType;
}
