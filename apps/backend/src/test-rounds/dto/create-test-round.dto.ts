import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsDateString, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { TestRoundType, TestResult } from '../../recruitment-common';

export class CreateTestRoundDto {
  @ApiProperty({ enum: TestRoundType, description: 'Type of test round' })
  @IsEnum(TestRoundType)
  @IsNotEmpty()
  roundType: TestRoundType;

  @ApiPropertyOptional({ description: 'Test type: TECHNICAL, SOFT_SKILLS, GENERAL' })
  @IsOptional()
  @IsString()
  testType?: 'TECHNICAL' | 'SOFT_SKILLS' | 'GENERAL';

  @ApiPropertyOptional({ description: 'When the test was assigned' })
  @IsOptional()
  @IsDateString()
  assignedAt?: string;

  @ApiPropertyOptional({ description: 'Test deadline' })
  @IsOptional()
  @IsDateString()
  deadlineAt?: string;

  @ApiPropertyOptional({ description: 'Passing score for the test' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  passingScore?: number;

  @ApiPropertyOptional({ description: 'External test ID from AMIS' })
  @IsOptional()
  @IsString()
  externalTestId?: string;
}
