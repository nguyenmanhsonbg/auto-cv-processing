import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CompetencyType, QuestionType } from '@interview-assistant/shared';

export class TestCaseDto {
  @IsString()
  input: string;

  @IsString()
  expectedOutput: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class StarterCodeDto {
  @IsString()
  language: string;

  @IsString()
  code: string;
}

export class CreateQuestionDto {
  @ApiProperty({ description: 'Category code (e.g. BACKEND_MUST, SOFT_SKILL)' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subcategory: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiPropertyOptional({ default: 1 })
  @IsNumber()
  @IsOptional()
  difficulty?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetLevels?: string[];

  @ApiPropertyOptional({ enum: QuestionType, default: QuestionType.OPEN_ENDED })
  @IsEnum(QuestionType)
  @IsOptional()
  type?: QuestionType;

  @ApiPropertyOptional({ enum: CompetencyType })
  @IsEnum(CompetencyType)
  @IsOptional()
  competencyType?: CompetencyType;

  @ApiPropertyOptional({ type: 'array', items: { type: 'object' } })
  @IsArray()
  @IsOptional()
  options?: { id: string; text: string }[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  correctAnswers?: string[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  expectedAnswer?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  scoringGuide?: string;

  @ApiPropertyOptional({ type: [TestCaseDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestCaseDto)
  @IsOptional()
  testCases?: TestCaseDto[];

  @ApiPropertyOptional({ type: [TestCaseDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestCaseDto)
  @IsOptional()
  hiddenTestCases?: TestCaseDto[];

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  timeLimit?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  memoryLimit?: number;

  @ApiPropertyOptional({ type: [StarterCodeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StarterCodeDto)
  @IsOptional()
  starterCode?: StarterCodeDto[];

  @ApiPropertyOptional()
  @IsOptional()
  architectureTemplate?: Record<string, unknown>;
}
