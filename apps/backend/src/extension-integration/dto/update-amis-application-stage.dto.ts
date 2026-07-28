import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateAmisApplicationStageDto {
  @ApiProperty({ description: 'The AMIS recruitment round id currently assigned to the candidate.' })
  @IsString()
  recruitmentRoundId: string;

  @ApiPropertyOptional({ description: 'The display name of the current AMIS recruitment round.' })
  @IsOptional()
  @IsString()
  recruitmentRoundName?: string;

  @ApiPropertyOptional({ description: 'The AMIS rejection reason, or null when the candidate is active again.' })
  @IsOptional()
  @IsString()
  reasonRemoved?: string | null;

  @ApiPropertyOptional({ description: 'The numeric AMIS application status, when available.' })
  @IsOptional()
  @IsNumber()
  status?: number;

  @ApiPropertyOptional({ description: 'The AMIS endpoint that provided the stage snapshot.' })
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @ApiPropertyOptional({ description: 'Timestamp supplied by the extension when the stage was observed.' })
  @IsOptional()
  @IsString()
  changedAt?: string;
}
