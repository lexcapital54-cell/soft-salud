import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsObject, IsOptional, Min } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { AestheticTrackingService } from './aesthetic-tracking.service';

export class SaveAestheticTrackingDto {
  @IsObject()
  data!: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

@Controller('patients/:patientId/aesthetic-tracking')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AestheticTrackingController {
  constructor(private readonly tracking: AestheticTrackingService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.AUXILIAR)
  get(@Req() req: { user: User }, @Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.tracking.get(req.user, patientId);
  }

  @Put()
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  save(
    @Req() req: { user: User },
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: SaveAestheticTrackingDto,
  ) {
    return this.tracking.save(req.user, patientId, dto);
  }
}
