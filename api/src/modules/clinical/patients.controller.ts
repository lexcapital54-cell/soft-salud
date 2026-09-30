import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import {
  CreatePatientDto,
  DentalInstructionsDto,
  QuickPatientDto,
  UpdatePatientDto,
} from './dto/patient.dto';
import { PatientsService } from './patients.service';

@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.HEALTH_PROFESSIONAL,
    UserRole.RECEPTIONIST, UserRole.AUXILIAR,
    UserRole.AUDITOR,
  )
  list(
    @Req() req: { user: User },
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.patientsService.list(req.user, q, { from, to });
  }

  @Get(':id/photo')
  @Roles(
    UserRole.ADMIN,
    UserRole.HEALTH_PROFESSIONAL,
    UserRole.RECEPTIONIST, UserRole.AUXILIAR,
    UserRole.AUDITOR,
  )
  getPhoto(@Req() req: { user: User }, @Param('id') id: string) {
    return this.patientsService.getPhoto(req.user, id);
  }

  @Post(':id/photo')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.RECEPTIONIST, UserRole.AUXILIAR)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  uploadPhoto(
    @Req() req: { user: User },
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.patientsService.uploadPhoto(req.user, id, file);
  }

  @Delete(':id/photo')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.RECEPTIONIST, UserRole.AUXILIAR)
  removePhoto(@Req() req: { user: User }, @Param('id') id: string) {
    return this.patientsService.removePhoto(req.user, id);
  }

  @Get(':id')
  @Roles(
    UserRole.ADMIN,
    UserRole.HEALTH_PROFESSIONAL,
    UserRole.RECEPTIONIST, UserRole.AUXILIAR,
    UserRole.AUDITOR,
  )
  getOne(@Req() req: { user: User }, @Param('id') id: string) {
    return this.patientsService.getForClinic(req.user, id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.RECEPTIONIST, UserRole.AUXILIAR)
  create(@Req() req: { user: User }, @Body() dto: CreatePatientDto) {
    return this.patientsService.create(req.user, dto);
  }

  @Post('quick')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.RECEPTIONIST, UserRole.AUXILIAR)
  quickCreate(@Req() req: { user: User }, @Body() dto: QuickPatientDto) {
    return this.patientsService.quickCreate(req.user, dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.RECEPTIONIST, UserRole.AUXILIAR)
  update(
    @Req() req: { user: User },
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patientsService.update(req.user, id, dto);
  }

  /**
   * Alias en POST. En los equipos del consultorio hay filtros de red que
   * descartan PATCH/PUT y la petición nunca sale del navegador, así que el
   * frontend actualiza por esta ruta.
   */
  @Post(':id/update')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.RECEPTIONIST, UserRole.AUXILIAR)
  updateViaPost(
    @Req() req: { user: User },
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patientsService.update(req.user, id, dto);
  }

  @Post(':id/therapeutic-frame')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  sendTherapeuticFrame(@Req() req: { user: User }, @Param('id') id: string) {
    return this.patientsService.sendTherapeuticFrame(req.user, id);
  }

  @Post(':id/dental-instructions')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  sendDentalInstructions(
    @Req() req: { user: User },
    @Param('id') id: string,
    @Body() dto: DentalInstructionsDto,
  ) {
    return this.patientsService.sendDentalInstructions(req.user, id, dto);
  }
}
