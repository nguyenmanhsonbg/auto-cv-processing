import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ExtensionTaskStatus,
  ExtensionTaskType,
} from '../enums/extension-integration.enum';

export class CreateExtensionTaskDto {
  @ApiProperty({ enum: ExtensionTaskType })
  @IsEnum(ExtensionTaskType)
  type: ExtensionTaskType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  assignedInstanceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;

  @ApiPropertyOptional({ default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxAttempts?: number;
}

export class ExtensionTaskProgressDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  eventType: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class CompleteExtensionTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  result?: Record<string, unknown>;
}

export class FailExtensionTaskDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  errorCode: string;

  @ApiProperty()
  @IsString()
  errorMessage: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  result?: Record<string, unknown>;
}

export class ExtensionTaskResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ExtensionTaskType })
  type: ExtensionTaskType;

  @ApiProperty({ enum: ExtensionTaskStatus })
  status: ExtensionTaskStatus;

  @ApiProperty()
  requestedByUserId: string;

  @ApiPropertyOptional()
  assignedInstanceId: string | null;

  @ApiPropertyOptional()
  claimedByInstanceId: string | null;

  @ApiPropertyOptional()
  lockedUntil: string | null;

  @ApiPropertyOptional()
  payload: Record<string, unknown> | null;

  @ApiPropertyOptional()
  result: Record<string, unknown> | null;

  @ApiPropertyOptional()
  errorCode: string | null;

  @ApiPropertyOptional()
  errorMessage: string | null;

  @ApiProperty()
  attemptCount: number;

  @ApiProperty()
  maxAttempts: number;

  @ApiProperty()
  priority: number;

  @ApiPropertyOptional()
  startedAt: string | null;

  @ApiPropertyOptional()
  finishedAt: string | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}
