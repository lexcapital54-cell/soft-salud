import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Diligenciamiento de un acta de capacitación SG-SST (líneas punteadas + firmas). */
export class FillTrainingActaDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  tema!: string;

  /** Fecha del acta (YYYY-MM-DD). */
  @IsString()
  @MinLength(8)
  @MaxLength(40)
  fecha!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  capacitadorNombre!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(255)
  asistenteNombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  objetivo?: string;

  /** Periodo del histórico mensual, ej. 2026-08. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  periodLabel?: string;

  /** Firma del capacitador / quien aprueba (data URL de imagen). */
  @IsString()
  @MinLength(40)
  capacitadorSignatureBase64!: string;

  /** Firma de la persona evaluada / asistente (data URL de imagen). */
  @IsString()
  @MinLength(40)
  asistenteSignatureBase64!: string;
}
