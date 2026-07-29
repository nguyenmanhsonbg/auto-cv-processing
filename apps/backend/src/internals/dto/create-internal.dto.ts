import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateInternalDto {
  @ApiProperty({ example: 'employee@viettel.com.vn' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @IsEmail()
  @Matches(/^[^\s@]+@viettel\.com\.vn$/i, {
    message: 'Internal email must use the @viettel.com.vn domain.',
  })
  email!: string;
}
