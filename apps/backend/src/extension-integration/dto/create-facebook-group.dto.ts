import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateFacebookGroupDto {
  @ApiPropertyOptional({ example: 'Viec lam IT Da Nang' })
  // Keep the original JSON type so implicit conversion cannot bypass @IsString.
  @Type(() => Object)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  targetName: string;

  @ApiPropertyOptional({ example: 'https://www.facebook.com/groups/1975445239752352' })
  // Keep the original JSON type so implicit conversion cannot bypass @IsString.
  @Type(() => Object)
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  targetUrl: string;

  @ApiPropertyOptional({ example: '1975445239752352' })
  // Keep the original JSON type so implicit conversion cannot bypass @IsString.
  @Type(() => Object)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  targetExternalId?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Stable Facebook account id resolved from the current browser session.' })
  @IsOptional()
  @IsUUID()
  facebookAccountId?: string;
}
