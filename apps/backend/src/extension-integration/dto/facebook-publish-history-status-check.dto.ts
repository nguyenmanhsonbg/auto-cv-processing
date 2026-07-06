import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { FacebookReviewStatus } from '../../facebook-publishing/facebook-publishing.types';

export class FacebookPublishHistoryStatusCheckDto {
  @ApiProperty({ enum: FacebookReviewStatus, enumName: 'FacebookReviewStatus' })
  @IsEnum(FacebookReviewStatus)
  facebookReviewStatus: FacebookReviewStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  message?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  externalPostUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalPostId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  checkedAt?: string | null;
}
