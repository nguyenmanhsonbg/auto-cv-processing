import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ParseCvDto {
  @ApiPropertyOptional({
    description: 'Parser mode used for audit metadata and idempotent retries',
    default: 'DEFAULT',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  parserMode?: string;

  @ApiPropertyOptional({
    description: 'Force a fresh parse even when this CV already has a parsed profile',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
