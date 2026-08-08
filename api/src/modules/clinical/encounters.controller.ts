import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { CreateEncounterDto, SaveClinicalRecordDto } from './dto/clinical.dto';
import { EncountersService } from './encounters.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CLINIC_ADMIN)
export class EncountersController {
  constructor(private readonly encountersService: EncountersService) {}

  @Get('encounters')
  list(@Req() req: { user: User }) {
    return this.encountersService.list(req.user);
  }

  @Get('encounters/:id')
  getOne(@Req() req: { user: User }, @Param('id') id: string) {
    return this.encountersService.getOne(req.user, id);
  }

  @Post('encounters')
  create(@Req() req: { user: User }, @Body() dto: CreateEncounterDto) {
    return this.encountersService.create(req.user, dto);
  }

  @Put('clinical-records/:encounterId')
  saveDraft(
    @Req() req: { user: User },
    @Param('encounterId') encounterId: string,
    @Body() dto: SaveClinicalRecordDto,
  ) {
    return this.encountersService.saveDraft(req.user, encounterId, dto);
  }
}
