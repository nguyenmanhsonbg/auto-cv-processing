import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { FacebookPublishTargetType } from '../../facebook-publishing/facebook-publishing.types';

export class ReserveFacebookPublishTargetDto {
  @ApiProperty()
  @IsUUID()
  jobPostingId: string;

  @ApiProperty()
  @IsUUID()
  targetId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  facebookAccountId?: string | null;

  @ApiProperty({ enum: FacebookPublishTargetType, enumName: 'FacebookPublishTargetType' })
  @IsEnum(FacebookPublishTargetType)
  targetType: FacebookPublishTargetType;

  @ApiProperty()
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
  @MaxLength(100000)
  content?: string | null;
}
