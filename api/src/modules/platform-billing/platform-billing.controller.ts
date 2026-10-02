import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import {
  CreatePlatformReceiptDto,
  GenerateMonthlyHostingDto,
  HostingPeriodDto,
  MarkReceiptPaidDto,
  UpdatePlatformFeeDto,
} from './dto/platform-billing.dto';
import { PlatformBillingService } from './platform-billing.service';

type AuthedRequest = Request & { user: User };

@Controller('platform-billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class PlatformBillingController {
  constructor(private readonly billing: PlatformBillingService) {}

  @Get('fees')
  listFees(@Req() req: AuthedRequest) {
    return this.billing.listFees(req.user);
  }

  @Patch('fees/:id')
  updateFee(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdatePlatformFeeDto,
  ) {
    return this.billing.updateFee(req.user, id, dto);
  }

  @Get('receipts')
  listReceipts(
    @Req() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.billing.listReceipts(req.user, from, to, clinicId);
  }

  @Post('receipts')
  createReceipt(@Req() req: AuthedRequest, @Body() dto: CreatePlatformReceiptDto) {
    return this.billing.createReceipt(req.user, dto);
  }

  @Post('receipts/:id/mark-paid')
  markPaid(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkReceiptPaidDto,
  ) {
    return this.billing.markReceiptPaid(req.user, id, dto);
  }

  @Post('receipts/:id/mark-pending')
  markPending(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.markReceiptPending(req.user, id);
  }

  @Post('monthly-hosting/generate')
  generateMonthly(
    @Req() req: AuthedRequest,
    @Body() dto: GenerateMonthlyHostingDto,
  ) {
    return this.billing.generateMonthlyHosting(req.user, dto);
  }

  @Get('hosting/status')
  hostingStatus(
    @Req() req: AuthedRequest,
    @Query('periodMonth') periodMonth: string,
  ) {
    if (!periodMonth) {
      return this.billing.hostingStatus(
        req.user,
        new Date().toISOString().slice(0, 7),
      );
    }
    return this.billing.hostingStatus(req.user, periodMonth);
  }

  @Post('hosting/notify-due')
  notifyDue(@Req() req: AuthedRequest, @Body() dto: HostingPeriodDto) {
    return this.billing.notifyHostingDue(req.user, dto);
  }

  @Post('hosting/suspend-unpaid')
  suspendUnpaid(@Req() req: AuthedRequest, @Body() dto: HostingPeriodDto) {
    return this.billing.suspendUnpaidHosting(req.user, dto);
  }

  @Get('income/monthly')
  monthlyIncome(@Req() req: AuthedRequest, @Query('year') year?: string) {
    return this.billing.monthlyIncome(
      req.user,
      year ? Number(year) : undefined,
    );
  }

  @Get('summary')
  summary(
    @Req() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.billing.summary(req.user, from, to);
  }

  @Get('receipts/:id/pdf')
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
}
