import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsUUID,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OverallResult } from '@interview-assistant/shared';

export class HrEvaluationDto {
  @IsString()
  @IsOptional()
  knowledge?: string;

  @IsString()
  @IsOptional()
  skills?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  certificates?: string;

  @IsString()
  @IsOptional()
  experience?: string;

  @IsString()
  @IsOptional()
  character?: string;

  @IsString()
  @IsOptional()
  careerGoal?: string;
}

export class TechnicalRatingDto {
  @IsString()
  subcategory: string;

  @IsString()
  @IsOptional()
  comment?: string;

  @IsNumber()
  @IsOptional()
  rating?: number;
}

export class PersonalityRatingDto {
  @IsString()
  category: string;

  @IsNumber()
  @IsOptional()
  rating?: number;

  @IsString()
  @IsOptional()
  reasoning?: string;
}

export class CreateEvaluationDto {
  @ApiProperty()
  @IsUUID()
  sessionId: string;

  @ApiPropertyOptional({ type: HrEvaluationDto })
  @ValidateNested()
  @Type(() => HrEvaluationDto)
  @IsOptional()
  hrEvaluation?: HrEvaluationDto;

  @ApiPropertyOptional({ type: [TechnicalRatingDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TechnicalRatingDto)
  @IsOptional()
  technicalRatings?: TechnicalRatingDto[];

  @ApiPropertyOptional({ type: [TechnicalRatingDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TechnicalRatingDto)
  @IsOptional()
  softSkillRatings?: TechnicalRatingDto[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  zoneResult?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  zoneExplanation?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  finalLevel?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  finalZone?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  finalSubZone?: string;

  @ApiPropertyOptional({ type: [PersonalityRatingDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersonalityRatingDto)
  @IsOptional()
  personalityRatings?: PersonalityRatingDto[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  expectedSalary?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  noticePeriod?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  plannedAssignment?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  jobDescription?: string;

  @ApiPropertyOptional({ enum: OverallResult })
  @IsEnum(OverallResult)
  @IsOptional()
  overallResult?: OverallResult;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  overallNotes?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  aiSummary?: string;
}
