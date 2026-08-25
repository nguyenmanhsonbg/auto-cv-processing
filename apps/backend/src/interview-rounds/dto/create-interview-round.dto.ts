import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsArray,
  IsDateString,
  IsString,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { InterviewRoundType, InterviewResult, InterviewGrade } from '../../recruitment-common';

export class CreateInterviewRoundDto {
  @ApiProperty({ enum: InterviewRoundType, description: 'Type of interview round' })
  @IsEnum(InterviewRoundType)
  @IsNotEmpty()
  roundType: InterviewRoundType;

  @ApiPropertyOptional({ type: [String], description: 'Interviewer user IDs (for committee)' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  interviewerIds?: string[];

  @ApiPropertyOptional({ description: 'External interviewer IDs from AMIS' })
  @IsOptional()
  @IsObject()
  externalInterviewerIds?: string[];

  @ApiPropertyOptional({ description: 'Scheduled interview time' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ enum: InterviewResult, description: 'Interview result' })
  @IsOptional()
  @IsEnum(InterviewResult)
  result?: InterviewResult;

  @ApiPropertyOptional({ enum: InterviewGrade, description: 'Overall interview grade' })
  @IsOptional()
  @IsEnum(InterviewGrade)
  overallGrade?: InterviewGrade;

  @ApiPropertyOptional({ description: 'Scores by criteria' })
  @IsOptional()
  @IsObject()
  scores?: Record<string, number>;

  @ApiPropertyOptional({ description: 'Interview summary/notes' })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({ description: 'External round ID from AMIS' })
  @IsOptional()
  @IsString()
  externalRoundId?: string;
}
