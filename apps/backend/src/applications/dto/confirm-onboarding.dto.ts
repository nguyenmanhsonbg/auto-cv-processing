import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class ConfirmOnboardingDto {
  @ApiPropertyOptional({
    description: 'Optional planned onboarding timestamp. It is not required to confirm onboarding.',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  plannedOnboardAt?: string;
}
