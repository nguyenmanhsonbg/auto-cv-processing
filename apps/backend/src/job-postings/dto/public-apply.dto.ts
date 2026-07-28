import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class PublicApplyDto {
  @ApiProperty({ example: 'Candidate Test' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fullName!: string;

  @ApiProperty({ example: 'candidate.test@example.com' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: '0900000001' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  phone!: string;

  @ApiPropertyOptional({ example: 'Public apply smoke test' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ example: 'FL000123' })
  @IsOptional()
  @IsString()
  freelancerCode?: string;

  @ApiPropertyOptional({ example: 'employee@viettel.com.vn' })
  @IsOptional()
  @ValidateIf((_object, value) => typeof value !== 'string' || value.trim() !== '')
  @IsEmail()
  @MaxLength(255)
  @Matches(/^[^\s@]+@viettel\.com\.vn$/i, {
    message: 'Internal email must use the @viettel.com.vn domain.',
  })
  internalEmail?: string;
}
