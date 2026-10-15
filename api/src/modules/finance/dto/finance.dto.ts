import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  PayrollNoveltyType,
  PayrollRunStatus,
  SupplyCategory,
  SupplyMovementType,
} from '@prisma/client';

export class UpdatePayrollSettingsDto {
  @IsNumber()
  @Min(0)
  smmlv: number;

  @IsNumber()
  @Min(0)
  transportAid: number;

  @IsBoolean()
  exempt114: boolean;
}

export class UpsertPayrollRunDto {
  @IsString()
  @MinLength(7)
  @MaxLength(7)
  period: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  employeeName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  idNumber: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsOptional()
  @IsDateString()
  payDate?: string;

  @IsOptional()
  @IsEnum(PayrollRunStatus)
  status?: PayrollRunStatus;

  @IsObject()
  input: Record<string, unknown>;

  @IsObject()
  result: Record<string, unknown>;
}

export class UpdatePayrollRunStatusDto {
  @IsEnum(PayrollRunStatus)
  status: PayrollRunStatus;
}

export class CreatePayrollNoveltyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  employeeName: string;

  @IsEnum(PayrollNoveltyType)
  type: PayrollNoveltyType;

  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpsertSupplyItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lotNumber?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @IsOptional()
  @IsEnum(SupplyCategory)
  category?: SupplyCategory;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Cantidad inicial solo al crear; después use movimientos. */
  @IsOptional()
  @IsInt()
  @Min(0)
  initialQuantity?: number;
}

export class CreateSupplyMovementDto {
  @IsEnum(SupplyMovementType)
  type: SupplyMovementType;

  /** IN/OUT: unidades del movimiento (≥ 1). ADJUST: stock absoluto resultante (≥ 0). */
  @IsInt()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  movedAt?: string;
}
