import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UploadCvDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  replaceCurrent?: boolean;

  @ApiPropertyOptional({
    description: 'Human-readable reason for manual upload or replacement.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
