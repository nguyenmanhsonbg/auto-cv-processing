import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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

  @ApiPropertyOptional({ description: 'The AMIS candidate page URL captured by the extension.' })
  @IsOptional()
  @IsString()
  pageUrl?: string;

  @ApiPropertyOptional({ description: 'True only when this event came from the AMIS update-round action.' })
  @IsOptional()
  @IsBoolean()
  isTransitionEvent?: boolean;

  @ApiPropertyOptional({ description: 'The numeric AMIS recruitment round type, when known.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  recruitmentRoundType?: number;

  @ApiPropertyOptional({ description: 'The AMIS recruitment round sort order, when known.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  recruitmentRoundSortOrder?: number;

  @ApiPropertyOptional({ description: 'The previous AMIS recruitment round id observed before the transition.' })
  @IsOptional()
  @IsString()
  previousRecruitmentRoundId?: string;

  @ApiPropertyOptional({ description: 'The previous AMIS recruitment round name observed before the transition.' })
  @IsOptional()
  @IsString()
  previousRecruitmentRoundName?: string;

  @ApiPropertyOptional({ description: 'The previous AMIS recruitment round type, when known.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  previousRecruitmentRoundType?: number;

  @ApiPropertyOptional({ description: 'The previous AMIS recruitment round sort order, when known.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  previousRecruitmentRoundSortOrder?: number;
}
