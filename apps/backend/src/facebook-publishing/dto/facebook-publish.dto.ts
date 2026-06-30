import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FacebookGroupTargetDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  groupName: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2048)
  groupUrl: string;
}

export class FacebookFanpageTargetDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  pageName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  pageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  pageUrl?: string;
}

export class FacebookPublishTargetsDto {
  @ApiPropertyOptional({ type: [FacebookGroupTargetDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FacebookGroupTargetDto)
  groups?: FacebookGroupTargetDto[];

  @ApiPropertyOptional({ type: [FacebookFanpageTargetDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FacebookFanpageTargetDto)
  fanpages?: FacebookFanpageTargetDto[];
}

export class FacebookPublishOptionsDto {
  @ApiPropertyOptional({ type: FacebookPublishTargetsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FacebookPublishTargetsDto)
  targets?: FacebookPublishTargetsDto;
}

export class ImportFacebookSessionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sessionOwnerKey?: string;

  @ApiProperty({
    description: 'Playwright storageState object with cookies and origins arrays.',
  })
  @IsObject()
  storageState: Record<string, unknown>;
}
