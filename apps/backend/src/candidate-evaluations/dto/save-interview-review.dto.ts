import { IsObject, IsOptional, IsInt, Min } from 'class-validator';
import type { InterviewEvaluationFormData } from '@interview-assistant/shared';

export class SaveInterviewReviewDto {
  @IsObject()
  formData: InterviewEvaluationFormData;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
