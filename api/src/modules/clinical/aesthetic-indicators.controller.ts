import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsUUID, Matches } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { AestheticIndicatorsService } from './aesthetic-indicators.service';

export class AestheticIndicatorsQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsUUID()
  professionalId?: string;
}

@Controller('aesthetic-indicators')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AestheticIndicatorsController {
  constructor(private readonly indicators: AestheticIndicatorsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  get(@Req() req: { user: User }, @Query() query: AestheticIndicatorsQueryDto) {
    return this.indicators.get(req.user, query);
  }
}
