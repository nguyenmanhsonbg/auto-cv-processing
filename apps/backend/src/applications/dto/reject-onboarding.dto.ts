import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectOnboardingDto {
  @ApiPropertyOptional({ description: 'Reason the candidate did not start.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
