import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { BillingService } from './billing.service';
import { BillingPlanService } from './billing-plan.service';
import {
  CreateExpenseDto,
  CreatePackageDto,
  CreateReceiptDto,
} from './dto/billing.dto';

type AuthedRequest = Request & { user: User };

const ROLES = [
  UserRole.ADMIN,
  UserRole.RECEPTIONIST,
  UserRole.HEALTH_PROFESSIONAL,
] as const;

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly plan: BillingPlanService,
  ) {}

  /** Plan de tratamiento de la historia (odontología y ortodoncia) con lo abonado y el saldo. */
  @Get('patients/:patientId/treatment-plan')
  @Roles(...ROLES)
  treatmentPlan(@Req() req: AuthedRequest, @Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.plan.planForPatient(req.user, patientId);
  }

  @Get('receipts')
  @Roles(...ROLES)
  listReceipts(
    @Req() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.billing.listReceipts(req.user, from, to);
  }

  @Post('receipts')
  @Roles(...ROLES)
  createReceipt(@Req() req: AuthedRequest, @Body() dto: CreateReceiptDto) {
    return this.billing.createReceipt(req.user, dto);
  }

  @Get('receipts/:id')
  @Roles(...ROLES)
  getReceipt(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.billing.getReceipt(req.user, id);
  }

  @Get('receipts/:id/pdf')
  @Roles(...ROLES)
  @Header('Content-Type', 'application/pdf')
  async receiptPdf(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.billing.receiptPdf(req.user, id);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  @Get('expenses')
  @Roles(...ROLES)
  listExpenses(
    @Req() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.billing.listExpenses(req.user, from, to);
  }

  @Post('expenses')
  @Roles(...ROLES)
  createExpense(@Req() req: AuthedRequest, @Body() dto: CreateExpenseDto) {
    return this.billing.createExpense(req.user, dto);
  }

  @Get('packages')
  @Roles(...ROLES)
  listPackages(
    @Req() req: AuthedRequest,
    @Query('patientId') patientId?: string,
  ) {
    return this.billing.listPackages(req.user, patientId);
  }

  @Post('packages')
  @Roles(...ROLES)
  createPackage(@Req() req: AuthedRequest, @Body() dto: CreatePackageDto) {
    return this.billing.createPackage(req.user, dto);
  }

  @Get('daily-close')
  @Roles(...ROLES)
  dailyClose(@Req() req: AuthedRequest, @Query('date') date?: string) {
    return this.billing.dailyClose(req.user, date);
  }

  @Get('summary')
  @Roles(...ROLES)
  summary(
    @Req() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.billing.summary(req.user, from, to);
  }
}
