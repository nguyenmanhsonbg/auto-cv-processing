import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, IsObject } from 'class-validator';

export class GenerateFacebookPreviewDto {
  @ApiPropertyOptional({ description: 'The ID of an existing job posting to generate content for.' })
  @IsOptional()
  @IsUUID('4')
  jobPostingId?: string;

  @ApiPropertyOptional({ description: 'The raw AMIS job snapshot.' })
  @IsOptional()
  @IsObject()
  snapshot?: any;

  @ApiPropertyOptional({ enum: ['TEMPLATE', 'AI'], description: 'Generation mode: TEMPLATE (programmatic pattern) or AI (Gemini)' })
  @IsOptional()
  @IsString()
  mode?: 'TEMPLATE' | 'AI';
}
