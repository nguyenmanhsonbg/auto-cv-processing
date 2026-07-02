import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  FacebookPublishResultStatus,
  FacebookPublishTargetType,
} from '../../facebook-publishing/facebook-publishing.types';

export class ReportFacebookPublishResultDto {
  @ApiProperty()
  @IsUUID()
  jobPostingId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  targetId?: string | null;

  @ApiProperty({ enum: FacebookPublishTargetType, enumName: 'FacebookPublishTargetType' })
  @IsEnum(FacebookPublishTargetType)
  targetType: FacebookPublishTargetType;

  @ApiProperty()
  @IsString()
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

  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  message: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalPostId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  submittedAt?: string | null;
}
