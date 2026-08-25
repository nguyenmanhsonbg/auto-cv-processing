import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateFacebookGroupDto {
  @ApiProperty({ example: 'Viec lam IT Da Nang' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  targetName: string;

  @ApiPropertyOptional({ description: 'Stable Facebook account id resolved from the current browser session.' })
  @IsOptional()
  @IsUUID()
  facebookAccountId?: string;
}
