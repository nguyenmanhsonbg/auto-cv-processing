import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DiscoverFacebookGroupItemDto {
  @ApiProperty({ example: 'Hoi lap Java' })
  @IsString()
  @MaxLength(255)
  targetName: string;

  @ApiProperty({ example: 'https://www.facebook.com/groups/javascript.vn' })
  @IsString()
  @MaxLength(2048)
  targetUrl: string;

  @ApiPropertyOptional({ example: 'javascript.vn' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  targetExternalId?: string;
}

export class DiscoverFacebookGroupsDto {
  @ApiProperty({
    type: [DiscoverFacebookGroupItemDto],
    isArray: true,
    example: [
      {
        targetName: 'Hoi lap Java',
        targetUrl: 'https://www.facebook.com/groups/javascript.vn',
        targetExternalId: 'javascript.vn',
      },
    ],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => DiscoverFacebookGroupItemDto)
  groups: DiscoverFacebookGroupItemDto[];
}

export class DiscoverFacebookGroupsResponseItemDto {
  @ApiProperty({
    enum: ['created', 'updated', 'reactivated', 'reused', 'conflict', 'skipped'],
    example: 'created',
  })
  action: 'created' | 'updated' | 'reactivated' | 'reused' | 'conflict' | 'skipped';

  @ApiProperty({ example: 'Viec lam IT Da Nang' })
  targetName: string;

  @ApiProperty({ example: 'https://www.facebook.com/groups/javascript.vn' })
  targetUrl: string;

  @ApiProperty({ example: 'javascript.vn', nullable: true })
  targetExternalId: string | null;

  @ApiProperty({ example: 'Viec lam IT Da Nang', nullable: true })
  targetId: string | null;

  @ApiProperty({ example: 'Auto skip group if it already exists in scan result' })
  reason?: string | null;
}

export class DiscoverFacebookGroupsResponseDto {
  @ApiProperty({ example: 150 })
  requested: number;

  @ApiProperty({ example: 140 })
  valid: number;

  @ApiProperty({ example: 10 })
  created: number;

  @ApiProperty({ example: 5 })
  updated: number;

  @ApiProperty({ example: 2 })
  reactivated: number;

  @ApiProperty({ example: 1 })
  duplicates: number;

  @ApiProperty({ example: 12 })
  filtered: number;

  @ApiProperty({ example: 0 })
  skipped: number;

  @ApiProperty({ example: 0 })
  conflicts: number;

  @ApiProperty({ example: [], type: [String] })
  errors: string[];

  @ApiProperty({
    type: [DiscoverFacebookGroupsResponseItemDto],
    isArray: true,
  })
  items: DiscoverFacebookGroupsResponseItemDto[];
}

