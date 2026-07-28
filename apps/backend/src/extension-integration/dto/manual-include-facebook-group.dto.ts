import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ManualIncludeFacebookGroupDto {
  @ApiProperty({ example: 'Hội Nhóm FullStack Hà Nội' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  targetName: string;

  @ApiProperty({ example: 'https://www.facebook.com/groups/1934436680847972' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  targetUrl: string;

  @ApiPropertyOptional({ example: '1934436680847972' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  targetExternalId?: string;

  @ApiProperty({ description: 'Stable Facebook account id resolved from the current browser session.' })
  @IsUUID()
  facebookAccountId: string;
}
