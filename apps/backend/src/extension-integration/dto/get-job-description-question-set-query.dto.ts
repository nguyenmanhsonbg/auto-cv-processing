import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class GetJobDescriptionQuestionSetQueryDto {
  @ApiPropertyOptional({
    description: 'Optional boolean query value; accepts only true or false.',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  latestSyncedOnly?: string;
}
