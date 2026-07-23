import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveFacebookAccountDto {
  @ApiProperty({ example: '100012345678901', description: 'Stable Facebook profile id or canonical profile path.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  facebookExternalId: string;

  @ApiPropertyOptional({ example: 'Nguyen Van A' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string | null;

  @ApiPropertyOptional({ example: 'https://www.facebook.com/profile.php?id=100012345678901' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  profileUrl?: string | null;
}
