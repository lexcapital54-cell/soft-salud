import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import {
  CreatePayrollNoveltyDto,
  CreateSupplyMovementDto,
  UpdatePayrollRunStatusDto,
  UpdatePayrollSettingsDto,
  UpsertPayrollRunDto,
  UpsertSupplyItemDto,
} from './dto/finance.dto';
import { FinanceService } from './finance.service';

type AuthedRequest = Request & { user: User };

@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('payroll/settings')
  getSettings(@Req() req: AuthedRequest) {
    return this.finance.getPayrollSettings(req.user);
  }

  @Put('payroll/settings')
  saveSettings(@Req() req: AuthedRequest, @Body() dto: UpdatePayrollSettingsDto) {
    return this.finance.savePayrollSettings(req.user, dto);
  }

  @Get('payroll/runs')
  listRuns(@Req() req: AuthedRequest, @Query('period') period?: string) {
    return this.finance.listPayrollRuns(req.user, period);
  }

  @Post('payroll/runs')
  upsertRun(@Req() req: AuthedRequest, @Body() dto: UpsertPayrollRunDto) {
    return this.finance.upsertPayrollRun(req.user, dto);
  }

  @Patch('payroll/runs/:id/status')
  updateRunStatus(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayrollRunStatusDto,
  ) {
    return this.finance.updatePayrollRunStatus(req.user, id, dto);
  }

  @Delete('payroll/runs/:id')
  deleteRun(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.deletePayrollRun(req.user, id);
  }

  @Get('payroll/novelties')
  listNovelties(@Req() req: AuthedRequest) {
    return this.finance.listNovelties(req.user);
  }

  @Post('payroll/novelties')
  createNovelty(@Req() req: AuthedRequest, @Body() dto: CreatePayrollNoveltyDto) {
    return this.finance.createNovelty(req.user, dto);
  }

  @Delete('payroll/novelties/:id')
  deleteNovelty(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.deleteNovelty(req.user, id);
  }

  @Get('inventory/items')
  listItems(@Req() req: AuthedRequest) {
    return this.finance.listSupplyItems(req.user);
  }

  @Get('inventory/summary')
  inventorySummary(
    @Req() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.finance.inventorySummary(req.user, from, to);
  }

  @Post('inventory/items')
  createItem(@Req() req: AuthedRequest, @Body() dto: UpsertSupplyItemDto) {
    return this.finance.createSupplyItem(req.user, dto);
  }

  @Put('inventory/items/:id')
  updateItem(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertSupplyItemDto,
  ) {
    return this.finance.updateSupplyItem(req.user, id, dto);
  }

  @Delete('inventory/items/:id')
  deleteItem(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.deleteSupplyItem(req.user, id);
  }

  @Post('inventory/items/:id/movements')
  createMovement(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSupplyMovementDto,
  ) {
    return this.finance.createSupplyMovement(req.user, id, dto);
  }
}
