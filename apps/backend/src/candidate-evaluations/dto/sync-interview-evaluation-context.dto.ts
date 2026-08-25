import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SyncInterviewEvaluationContextDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  amisRoundId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  amisRoundName: string;

  @IsInt()
  @Min(1)
  @Max(10)
  amisRoundType: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  amisSortOrder: number;
}
