import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsArray, ValidateNested, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class FacebookGroupDiscoverItemDto {
  @ApiProperty({ example: 'IT Korean Comtor-BA-BrSE' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  targetName: string;

  @ApiProperty({ example: 'https://www.facebook.com/groups/1920197328189583' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  targetUrl: string;

  @ApiProperty({ example: '1920197328189583' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  targetExternalId: string;
}

export class DiscoverFacebookGroupsDto {
  @ApiProperty({ type: [FacebookGroupDiscoverItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FacebookGroupDiscoverItemDto)
  groups: FacebookGroupDiscoverItemDto[];
}
