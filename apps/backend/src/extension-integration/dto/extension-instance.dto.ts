import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  ExtensionCapability,
  ExtensionInstanceStatus,
} from '../enums/extension-integration.enum';

export class RegisterExtensionInstanceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  installId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  version?: string;

  @ApiPropertyOptional({ enum: ExtensionCapability, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(ExtensionCapability, { each: true })
  capabilities?: ExtensionCapability[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class HeartbeatExtensionInstanceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  version?: string;

  @ApiPropertyOptional({ enum: ExtensionCapability, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(ExtensionCapability, { each: true })
  capabilities?: ExtensionCapability[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ExtensionInstanceResponseDto {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  ownerUserId: string;

  @ApiProperty()
  installId: string;

  @ApiPropertyOptional()
  displayName: string | null;

  @ApiPropertyOptional()
  version: string | null;

  @ApiProperty({ enum: ExtensionInstanceStatus })
  status: ExtensionInstanceStatus;

  @ApiProperty({ enum: ExtensionCapability, isArray: true })
  capabilities: ExtensionCapability[];

  @ApiPropertyOptional()
  lastSeenAt: string | null;

  @ApiProperty()
  registeredAt: string;

  @ApiPropertyOptional()
  disabledAt: string | null;

  @ApiPropertyOptional()
  metadata: Record<string, unknown> | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}
