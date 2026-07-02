import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsDefined,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  EXTENSION_SYNC_CHANNELS,
  ExtensionSourceSystem,
  ExtensionSyncAction,
  type ExtensionSyncChannel,
} from '../enums/extension-integration.enum';

export class AmisJobRequirementSectionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ isArray: true, type: String })
  @IsArray()
  @IsString({ each: true })
  items: string[];
}

export class AmisJobRequirementsDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  rawText: string;

  @ApiPropertyOptional({ type: () => [AmisJobRequirementSectionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AmisJobRequirementSectionDto)
  sections?: AmisJobRequirementSectionDto[];

  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mustHaveSkills?: string[];

  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  niceToHaveSkills?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  minExperienceYears?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  education?: string;

  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  certifications?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AmisJobSnapshotDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ type: () => AmisJobRequirementsDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => AmisJobRequirementsDto)
  requirements: AmisJobRequirementsDto;

  @ApiPropertyOptional({
    description: 'Optional benefits payload. Rich text/schema mapping is not confirmed in this batch.',
  })
  @IsOptional()
  benefits?: string | Record<string, unknown> | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'ISO date string if AMIS provides a confirmed value.' })
  @IsOptional()
  @IsDateString()
  deadline?: string;
}

export class SyncAmisJobPostingDto {
  @ApiProperty({ enum: ExtensionSourceSystem, enumName: 'ExtensionSourceSystem' })
  @IsEnum(ExtensionSourceSystem)
  sourceSystem: ExtensionSourceSystem;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  amisRecruitmentId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  amisUrl?: string;

  @ApiProperty({ enum: ExtensionSyncAction, enumName: 'ExtensionSyncAction' })
  @IsEnum(ExtensionSyncAction)
  action: ExtensionSyncAction;

  @ApiPropertyOptional({
    description: 'Optional body mirror only. The Idempotency-Key header remains authoritative.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  idempotencyKey?: string;

  @ApiProperty({ type: () => AmisJobSnapshotDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => AmisJobSnapshotDto)
  snapshot: AmisJobSnapshotDto;

  @ApiProperty({ enum: EXTENSION_SYNC_CHANNELS, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn([...EXTENSION_SYNC_CHANNELS], { each: true })
  channels: ExtensionSyncChannel[];

  @ApiPropertyOptional({
    isArray: true,
    type: String,
    description: 'Selected active Facebook group target ids. Required when FACEBOOK is selected.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  facebookTargetIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
