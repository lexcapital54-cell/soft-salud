import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import {
  CreateEncounterDto,
  CreateEvolutionDto,
  ListEncountersQueryDto,
  SaveClinicalRecordDto,
  SignClinicalRecordDto,
  UpdateAttendanceMetaDto,
  UpdateDiagnosesDto,
  UpdateProceduresDto,
  UpdateProfessionalCardDto,
  UpdateProfessionalSignatureDto,
} from './dto/clinical.dto';
import { EncountersService } from './encounters.service';
import { ProfessionalSignatureService } from './professional-signature.service';
import { PrismaService } from '../../prisma/prisma.module';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class EncountersController {
  constructor(
    private readonly encountersService: EncountersService,
    private readonly signatures: ProfessionalSignatureService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('encounters')
  @Roles(
    UserRole.ADMIN,
    UserRole.HEALTH_PROFESSIONAL,
    UserRole.AUDITOR, UserRole.AUXILIAR,
    UserRole.RECEPTIONIST,
  )
  list(@Req() req: { user: User }, @Query() query: ListEncountersQueryDto) {
    return this.encountersService.list(req.user, query);
  }

  /** Historia única del paciente; `null` si todavía no tiene ninguna. */
  @Get('encounters/for-patient/:patientId')
  @Roles(
    UserRole.ADMIN,
    UserRole.HEALTH_PROFESSIONAL,
    UserRole.AUDITOR, UserRole.AUXILIAR,
  )
  forPatient(
    @Req() req: { user: User },
    @Param('patientId') patientId: string,
  ) {
    return this.encountersService.forPatient(req.user, patientId);
  }

  @Get('encounters/for-patient/:patientId/last-situation')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  lastCurrentSituation(
    @Req() req: { user: User },
    @Param('patientId') patientId: string,
  ) {
    return this.encountersService.lastCurrentSituation(req.user, patientId);
  }

  /** Historias clínicas abiertas (borrador sin cerrar). */
  @Get('encounters/open')
  @Roles(
    UserRole.ADMIN,
    UserRole.HEALTH_PROFESSIONAL,
    UserRole.AUDITOR, UserRole.AUXILIAR,
    UserRole.RECEPTIONIST,
  )
  listOpen(@Req() req: { user: User }) {
    return this.encountersService.listOpen(req.user);
  }

  @Get('encounters/:id')
  @Roles(
    UserRole.ADMIN,
    UserRole.HEALTH_PROFESSIONAL,
    UserRole.AUDITOR, UserRole.AUXILIAR,
  )
  getOne(@Req() req: { user: User }, @Param('id') id: string) {
    return this.encountersService.getOne(req.user, id);
  }

  @Get('encounters/:id/ortho-history')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL, UserRole.AUDITOR, UserRole.AUXILIAR)
  orthoHistory(@Req() req: { user: User }, @Param('id') id: string) {
    return this.encountersService.orthoHistory(req.user, id);
  }

  @Post('encounters')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  create(@Req() req: { user: User }, @Body() dto: CreateEncounterDto) {
    return this.encountersService.create(req.user, dto);
  }

  @Put('clinical-records/:encounterId')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  saveDraft(
    @Req() req: { user: User },
    @Param('encounterId') encounterId: string,
    @Body() dto: SaveClinicalRecordDto,
  ) {
    return this.encountersService.saveDraft(req.user, encounterId, dto);
  }

  /** Alias en POST: ver nota sobre PATCH/PUT en PatientsController. */
  @Post('clinical-records/:encounterId/save')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  saveDraftViaPost(
    @Req() req: { user: User },
    @Param('encounterId') encounterId: string,
    @Body() dto: SaveClinicalRecordDto,
  ) {
    return this.encountersService.saveDraft(req.user, encounterId, dto);
  }

  @Post('clinical-records/:encounterId/attendance-meta')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  updateAttendanceMeta(
    @Req() req: { user: User },
    @Param('encounterId') encounterId: string,
    @Body() dto: UpdateAttendanceMetaDto,
  ) {
    return this.encountersService.updateAttendanceMeta(req.user, encounterId, dto);
  }

  @Post('clinical-records/:encounterId/diagnoses')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  updateDiagnoses(
    @Req() req: { user: User },
    @Param('encounterId') encounterId: string,
    @Body() dto: UpdateDiagnosesDto,
  ) {
    return this.encountersService.updateDiagnoses(req.user, encounterId, dto);
  }

  @Post('clinical-records/:encounterId/procedures')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  updateProcedures(
    @Req() req: { user: User },
    @Param('encounterId') encounterId: string,
    @Body() dto: UpdateProceduresDto,
  ) {
    return this.encountersService.updateProcedures(req.user, encounterId, dto);
  }

  @Post('clinical-records/:encounterId/sign')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  sign(
    @Req() req: { user: User },
    @Param('encounterId') encounterId: string,
    @Body() dto: SignClinicalRecordDto,
  ) {
    return this.encountersService.sign(req.user, encounterId, dto);
  }

  @Post('clinical-records/:encounterId/evolutions')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  addEvolution(
    @Req() req: { user: User },
    @Param('encounterId') encounterId: string,
    @Body() dto: CreateEvolutionDto,
  ) {
    return this.encountersService.addEvolution(req.user, encounterId, dto);
  }

  @Get('me/professional-signature')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  getMySignature(@Req() req: { user: User }) {
    return this.signatures.get(req.user);
  }

  @Put('me/professional-signature')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  saveMySignature(
    @Req() req: { user: User },
    @Body() dto: UpdateProfessionalSignatureDto,
  ) {
    return this.signatures.save(req.user, dto.signatureBase64);
  }

  /** Alias en POST: ver nota sobre PATCH/PUT en PatientsController. */
  @Post('me/professional-signature')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  saveMySignatureViaPost(
    @Req() req: { user: User },
    @Body() dto: UpdateProfessionalSignatureDto,
  ) {
    return this.signatures.save(req.user, dto.signatureBase64);
  }

  @Delete('me/professional-signature')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  removeMySignature(@Req() req: { user: User }) {
    return this.signatures.remove(req.user);
  }

  /** Tarjeta profesional que acompaña la firma en la historia clínica y su PDF. */
  @Get('me/professional-card')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  async getProfessionalCard(@Req() req: { user: User }) {
    const row = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { professionalCard: true },
    });
    return { professionalCard: row?.professionalCard ?? null };
  }

  @Put('me/professional-card')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  saveProfessionalCard(@Req() req: { user: User }, @Body() dto: UpdateProfessionalCardDto) {
    return this.storeProfessionalCard(req.user, dto);
  }

  /** Alias en POST: ver nota sobre PATCH/PUT en PatientsController. */
  @Post('me/professional-card')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  saveProfessionalCardViaPost(@Req() req: { user: User }, @Body() dto: UpdateProfessionalCardDto) {
    return this.storeProfessionalCard(req.user, dto);
  }

  private async storeProfessionalCard(user: User, dto: UpdateProfessionalCardDto) {
    const value = dto.professionalCard.replace(/\s+/g, ' ').trim();
    if (value.length < 2) throw new BadRequestException('Escriba el número de tarjeta profesional.');
    const row = await this.prisma.user.update({
      where: { id: user.id },
      data: { professionalCard: value },
      select: { professionalCard: true },
    });
    return { professionalCard: row.professionalCard };
  }

  /** Toggle Res. 2275 RIPS (facturación EPS). No afecta generación RDA. */
  @Get('me/rips-settings')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  async getRipsSettings(@Req() req: { user: User }) {
    const row = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { ripsEnabled: true },
    });
    return {
      ripsEnabled: row?.ripsEnabled ?? false,
      note:
        'Desactive este módulo si su consulta es 100% particular. El RDA (Res. 866 / Ley 2015) se sigue generando al firmar la HCE.',
    };
  }

  /** RIPS por sede lo activa solo HABILISALUD (POST /clinics/:id/rips); el consultorio no puede cambiarlo. */
  @Put('me/rips-settings')
  @Roles(UserRole.SUPER_ADMIN)
  saveRipsSettings() {
    throw new ForbiddenException('RIPS lo habilita HABILISALUD desde el panel de administración.');
  }

  @Post('me/rips-settings')
  @Roles(UserRole.SUPER_ADMIN)
  saveRipsSettingsViaPost() {
    return this.saveRipsSettings();
  }

  /**
   * Vencimiento REPS del profesional (habilitación individual).
   * Independiente de la sede; se alerta en el dashboard si está vencido o por vencer.
   */
  @Get('me/reps-settings')
  @Roles(UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL)
  async getRepsSettings(@Req() req: { user: User }) {
    const row = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { repsExpirationDate: true },
    });
    const repsExpirationDate = this.formatDateOnly(row?.repsExpirationDate ?? null);
    return {
      ...this.repsStatusPayload(repsExpirationDate),
      note: 'La fecha REPS la registra HABILISALUD. Recibirá aviso a 60 y 30 días, y si ya venció.',
    };
  }

  @Put('me/reps-settings')
  @Roles(UserRole.SUPER_ADMIN)
  saveRepsSettings() {
    throw new ForbiddenException('La fecha REPS la actualiza HABILISALUD desde el panel de administración.');
  }

  @Post('me/reps-settings')
  @Roles(UserRole.SUPER_ADMIN)
  saveRepsSettingsViaPost() {
    return this.saveRepsSettings();
  }

  private formatDateOnly(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value.slice(0, 10);
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private repsStatusPayload(repsExpirationDate: string | null) {
    if (!repsExpirationDate) {
      return {
        repsExpirationDate: null as string | null,
        status: 'MISSING' as const,
        daysRemaining: null as number | null,
        alertLevel: 'info' as const,
        message: 'Sin fecha de vencimiento REPS registrada.',
      };
    }
    const today = new Date();
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const [y, m, d] = repsExpirationDate.split('-').map(Number);
    const expUtc = Date.UTC(y, m - 1, d);
    const daysRemaining = Math.round((expUtc - todayUtc) / 86_400_000);

    if (daysRemaining < 0) {
      return {
        repsExpirationDate,
        status: 'EXPIRED' as const,
        daysRemaining,
        alertLevel: 'urgent' as const,
        message: `REPS vencido hace ${Math.abs(daysRemaining)} día(s). Renueve su registro.`,
      };
    }
    if (daysRemaining <= 30) {
      return {
        repsExpirationDate,
        status: 'CRITICAL' as const,
        daysRemaining,
        alertLevel: 'urgent' as const,
        message: `REPS vence en ${daysRemaining} día(s). Gestione la renovación con urgencia.`,
      };
    }
    if (daysRemaining <= 60) {
      return {
        repsExpirationDate,
        status: 'WARNING' as const,
        daysRemaining,
        alertLevel: 'warn' as const,
        message: `REPS vence en ${daysRemaining} días. Prepare la renovación.`,
      };
    }
    return {
      repsExpirationDate,
      status: 'OK' as const,
      daysRemaining,
      alertLevel: 'ok' as const,
      message: `REPS vigente. Vence en ${daysRemaining} días.`,
    };
  }
}
