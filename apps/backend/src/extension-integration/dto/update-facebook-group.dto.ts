import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateFacebookGroupDto {
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
}
