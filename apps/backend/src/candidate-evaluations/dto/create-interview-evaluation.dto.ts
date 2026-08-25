import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsUUID,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  InterviewEvaluationRoundKey,
  InterviewEvaluationTemplate,
} from '@interview-assistant/shared';

export class CreateInterviewEvaluationDto {
  @IsOptional()
  @IsEnum(InterviewEvaluationRoundKey)
  roundKey?: InterviewEvaluationRoundKey;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  roundName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  amisRoundId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  amisRoundType?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  amisSortOrder?: number;

  @IsOptional()
  @IsEnum(InterviewEvaluationTemplate)
  template?: InterviewEvaluationTemplate;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  committeeUserIds?: string[];

  @IsOptional()
  @IsUUID('4')
  committeeId?: string;
}
