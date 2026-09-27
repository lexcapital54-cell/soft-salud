import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import {
  PaymentMethod,
  PlatformChargeKind,
  PlatformPlanVariant,
} from '@prisma/client';

export class CreatePlatformReceiptDto {
  @IsUUID()
  clinicId!: string;

  @IsEnum(PlatformChargeKind)
  kind!: PlatformChargeKind;

  @IsEnum(PlatformPlanVariant)
  plan!: PlatformPlanVariant;

  @IsOptional()
  @IsString()
  @MinLength(2)
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  /** YYYY-MM for MONTHLY_HOSTING */
  @IsOptional()
  @IsString()
  periodMonth?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePlatformFeeDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  @MinLength(2)
  label?: string;
}

export class GenerateMonthlyHostingDto {
  /** YYYY-MM */
  @IsString()
  periodMonth!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  /** If set, only this clinic; otherwise all active with dashboard. */
  @IsOptional()
  @IsUUID()
  clinicId?: string;
}

export class HostingPeriodDto {
  /** YYYY-MM */
  @IsString()
  periodMonth!: string;

  @IsOptional()
  @IsUUID()
  clinicId?: string;
}
