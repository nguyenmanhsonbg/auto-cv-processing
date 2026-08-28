import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class CompleteOnboardingDto {
  @ApiPropertyOptional({
    description: 'Actual onboarding success timestamp. Defaults to now when omitted.',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  onboardedAt?: string;
}
