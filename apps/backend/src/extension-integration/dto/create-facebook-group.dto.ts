import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateFacebookGroupDto {
  @ApiProperty({ example: 'Viec lam IT Da Nang' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  targetName: string;

  @ApiProperty({ example: 'https://www.facebook.com/groups/1975445239752352' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  targetUrl: string;

  @ApiPropertyOptional({ description: 'Stable Facebook account id resolved from the current browser session.' })
  @IsOptional()
  @IsUUID()
  facebookAccountId?: string;
}
