import { ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsArray, IsDateString, IsString, IsObject, IsUUID } from 'class-validator';
import { InterviewResult, InterviewGrade } from '../../recruitment-common';
import { CreateInterviewRoundDto } from './create-interview-round.dto';

export class UpdateInterviewRoundDto extends PartialType(CreateInterviewRoundDto) {
  @ApiPropertyOptional({ description: 'Mark interview as started' })
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional({ description: 'Mark interview as completed' })
  @IsOptional()
  @IsDateString()
  completedAt?: string;

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
}
