import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

function trimOptionalValue(value: unknown) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export class SyncAmisCurrentUserIdentityDto {
  @ApiProperty({ description: 'Stable AMIS UserID captured from the logged-in AMIS session.' })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  @MaxLength(150)
  amisUserId: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => trimOptionalValue(value))
  fullName?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  @Transform(({ value }) => trimOptionalValue(value))
  email?: string;

  @ApiPropertyOptional({ nullable: true, description: 'AMIS phone number; used when AMIS does not expose an email.' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => trimOptionalValue(value))
  phone?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Transform(({ value }) => trimOptionalValue(value))
  tenantId?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Transform(({ value }) => trimOptionalValue(value))
  userName?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Transform(({ value }) => trimOptionalValue(value))
  employeeCode?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => trimOptionalValue(value))
  sourceUrl?: string;
}
