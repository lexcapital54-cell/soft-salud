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
  UpdateProfessionalSignatureDto,
} from './dto/clinical.dto';
import { EncountersService } from './encounters.service';
import { ProfessionalSignatureService } from './professional-signature.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class EncountersController {
  constructor(
    private readonly encountersService: EncountersService,
    private readonly signatures: ProfessionalSignatureService,
  ) {}

  @Get('encounters')
  @Roles(
    UserRole.ADMIN,
    UserRole.HEALTH_PROFESSIONAL,
    UserRole.AUDITOR,
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
    UserRole.AUDITOR,
  )
  forPatient(
    @Req() req: { user: User },
    @Param('patientId') patientId: string,
  ) {
    return this.encountersService.forPatient(req.user, patientId);
  }

  @Get('encounters/:id')
  @Roles(
    UserRole.ADMIN,
    UserRole.HEALTH_PROFESSIONAL,
    UserRole.AUDITOR,
  )
  getOne(@Req() req: { user: User }, @Param('id') id: string) {
    return this.encountersService.getOne(req.user, id);
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
}
