import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class SyncAmisJobStatusDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  amisRecruitmentId: string;

  @ApiProperty({ enum: [1, 2, 3, 5] })
  @IsNumber()
  @IsIn([1, 2, 3, 5])
  amisStatus: 1 | 2 | 3 | 5;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceUrl?: string;
}

export class SyncAmisJobStatusResponseDto {
  @ApiProperty()
  amisRecruitmentId: string;

  @ApiProperty()
  jobPostingId: string;

  @ApiProperty()
  amisStatus: number;

  @ApiProperty()
  status: string;
}
