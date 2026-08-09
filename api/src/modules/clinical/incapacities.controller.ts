import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import {
  CreateIncapacityDto,
  SignIncapacityDto,
  UpdateIncapacityDto,
} from './dto/incapacity.dto';
import { IncapacitiesService } from './incapacities.service';

@Controller('incapacities')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
export class IncapacitiesController {
  constructor(private readonly incapacitiesService: IncapacitiesService) {}

  @Get()
  listByEncounter(
    @Req() req: { user: User },
    @Query('encounterId') encounterId: string,
  ) {
    return this.incapacitiesService.listByEncounter(req.user, encounterId);
  }

  @Get(':id')
  getOne(@Req() req: { user: User }, @Param('id') id: string) {
    return this.incapacitiesService.getOne(req.user, id);
  }

  @Post()
  create(@Req() req: { user: User }, @Body() dto: CreateIncapacityDto) {
    return this.incapacitiesService.create(req.user, dto);
  }

  @Put(':id')
  update(
    @Req() req: { user: User },
    @Param('id') id: string,
    @Body() dto: UpdateIncapacityDto,
  ) {
    return this.incapacitiesService.update(req.user, id, dto);
  }

  @Post(':id/sign')
  sign(
    @Req() req: { user: User },
    @Param('id') id: string,
    @Body() dto: SignIncapacityDto,
  ) {
    return this.incapacitiesService.sign(req.user, id, dto);
  }

  @Patch(':id/void')
  void(@Req() req: { user: User }, @Param('id') id: string) {
    return this.incapacitiesService.void(req.user, id);
  }
}
