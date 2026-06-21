import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ParseCvDto {
  @ApiPropertyOptional({
    description: 'Parser mode used for audit metadata and idempotent retries',
    default: 'DEFAULT',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  parserMode?: string;
}
