import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  FacebookPublishResultStatus,
  FacebookReviewStatus,
  FacebookPublishTargetType,
} from '../../facebook-publishing/facebook-publishing.types';

export class ReportFacebookPublishResultDto {
  @ApiProperty()
  @IsUUID()
  jobPostingId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Object)
  @IsUUID()
  targetId?: string | null;

  @ApiProperty({ enum: FacebookPublishTargetType, enumName: 'FacebookPublishTargetType' })
  @IsEnum(FacebookPublishTargetType)
  targetType: FacebookPublishTargetType;

  @ApiProperty()
  @Type(() => Object)
  @IsString()
  @Matches(/\S/)
  @MaxLength(255)
  targetName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  targetUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string | null;

  @ApiProperty({ enum: FacebookPublishResultStatus, enumName: 'FacebookPublishResultStatus' })
  @IsEnum(FacebookPublishResultStatus)
  status: FacebookPublishResultStatus;

  @ApiPropertyOptional({ enum: FacebookReviewStatus, enumName: 'FacebookReviewStatus' })
  @IsOptional()
  @IsEnum(FacebookReviewStatus)
  facebookReviewStatus?: FacebookReviewStatus | null;

  @ApiProperty()
  @Type(() => Object)
  @IsString()
  @Matches(/\S/)
  @MaxLength(4000)
  message: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalPostId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  externalPostUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  submittedAt?: string | null;
}
