import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsObject, IsOptional, Min } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { OrthoTrackingService } from './ortho-tracking.service';

export class SaveOrthoTrackingDto {
  @IsObject()
  data!: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

@Controller('patients/:patientId/ortho-tracking')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrthoTrackingController {
  constructor(private readonly tracking: OrthoTrackingService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.AUXILIAR)
  get(@Req() req: { user: User }, @Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.tracking.get(req.user, patientId);
  }

  @Put()
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.AUXILIAR)
  save(
    @Req() req: { user: User },
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: SaveOrthoTrackingDto,
  ) {
    return this.tracking.save(req.user, patientId, dto);
  }
}
