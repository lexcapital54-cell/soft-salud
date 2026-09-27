import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SearchHceExportQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
