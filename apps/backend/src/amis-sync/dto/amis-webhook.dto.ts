import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, IsDateString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum AmisEventType {
  STAGE_CHANGED = 'STAGE_CHANGED',
  ROUND_UPDATED = 'ROUND_UPDATED',
}

// ========================================
// AMIS Response Format - captured from browser
// ========================================

export class AmisRecruitmentRoundTime {
  @ApiProperty({ description: 'Round state (1 = active)' })
  @IsNumber()
  State: number;

  @ApiProperty({ description: 'AMIS Candidate ID' })
  @IsNumber()
  CandidateID: number;

  @ApiProperty()
  @IsNumber()
  RecruitmentID: number;

  @ApiProperty({ description: 'Timestamp of round change' })
  @IsDateString()
  ChangeRoundTime: string;

  @ApiProperty({ description: 'AMIS Recruitment Round ID' })
  @IsNumber()
  RecruitmentRoundID: number;

  @ApiProperty({ description: 'Round name from AMIS' })
  @IsString()
  RecruitmentRoundName: string;

  @ApiProperty({ description: 'Sort order of the round' })
  @IsNumber()
  SortOrder: number;
}

export class AmisWebhookPayloadDto {
  @ApiPropertyOptional({ enum: AmisEventType, default: AmisEventType.ROUND_UPDATED })
  @IsOptional()
  @IsEnum(AmisEventType)
  eventType?: AmisEventType;

  @ApiProperty({ description: 'AMIS Recruitment ID (JD)' })
  @IsNumber()
  RecruitmentID: number;

  @ApiPropertyOptional({ description: 'AMIS Recruitment Round ID' })
  @IsOptional()
  @IsNumber()
  RecruitmentRoundID?: number;

  @ApiPropertyOptional({ description: 'Candidate IDs (comma-separated)' })
  @IsOptional()
  @IsString()
  CandidateIDs?: string;

  @ApiPropertyOptional({ description: 'Round change times from AMIS response' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AmisRecruitmentRoundTime)
  RecruitmentRoundTimes?: AmisRecruitmentRoundTime[];

  @ApiPropertyOptional()
  @IsOptional()
  IsProfile?: boolean;

  @ApiPropertyOptional({ description: 'AMIS Candidate ID (single)' })
  @IsOptional()
  @IsNumber()
  CandidateID?: number;

  @ApiPropertyOptional({ description: 'Round name' })
  @IsOptional()
  @IsString()
  RecruitmentRoundName?: string;

  @ApiPropertyOptional({ description: 'Sort order from AMIS' })
  @IsOptional()
  @IsNumber()
  SortOrder?: number;
}

// ========================================
// Internal DTOs
// ========================================

export class SyncResultDto {
  success: boolean;
  message: string;
  syncedCandidateIds?: string[];
  errors?: string[];
}
