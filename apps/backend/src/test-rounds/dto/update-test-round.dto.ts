import { ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsDateString, IsNumber, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { TestResult } from '../../recruitment-common';
import { CreateTestRoundDto } from './create-test-round.dto';

export class UpdateTestRoundDto extends PartialType(CreateTestRoundDto) {
  @ApiPropertyOptional({ description: 'Mark test as assigned' })
  @IsOptional()
  @IsDateString()
  assignedAt?: string;

  @ApiPropertyOptional({ description: 'Candidate submitted test at' })
  @IsOptional()
  @IsDateString()
  submittedAt?: string;

  @ApiPropertyOptional({ description: 'Test was evaluated at' })
  @IsOptional()
  @IsDateString()
  evaluatedAt?: string;

  @ApiPropertyOptional({ enum: TestResult, description: 'Test result' })
  @IsOptional()
  @IsEnum(TestResult)
  result?: TestResult;

  @ApiPropertyOptional({ description: 'Test score' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  score?: number;

  @ApiPropertyOptional({ description: 'Evaluator comment' })
  @IsOptional()
  @IsString()
  comment?: string;
}
