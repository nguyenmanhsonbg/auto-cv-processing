import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { FacebookPublishTargetEligibilityStatus } from '../../facebook-publishing/facebook-publishing.types';

export class VerifyFacebookGroupDto {
  @ApiProperty({
    enum: FacebookPublishTargetEligibilityStatus,
    enumName: 'FacebookPublishTargetEligibilityStatus',
  })
  @IsEnum(FacebookPublishTargetEligibilityStatus)
  eligibilityStatus: FacebookPublishTargetEligibilityStatus;

  @ApiPropertyOptional({ example: 'Current Facebook account can open the group composer.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  eligibilityReason?: string | null;

  @ApiPropertyOptional({ example: '2026-07-03T10:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  verifiedAt?: string | null;
}
