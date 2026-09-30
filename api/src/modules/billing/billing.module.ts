import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingPlanService } from './billing-plan.service';
import { ReceiptPdfService } from './receipt-pdf.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, BillingPlanService, ReceiptPdfService],
  exports: [BillingService],
})
export class BillingModule {}
