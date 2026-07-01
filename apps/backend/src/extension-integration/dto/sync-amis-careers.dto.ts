import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ArrayUnique,
  ValidateNested,
} from 'class-validator';
import { CompetencyType, QuestionType } from '@interview-assistant/shared';

export class SyncAmisCareerItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  amisCareerId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  code?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  organizationUnitId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  organizationUnitName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  usageStatus?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  parentAmisCareerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Sanitized AMIS career row for support/debug. Must not contain AMIS cookies or secrets.',
  })
  @IsOptional()
  @IsObject()
  rawSnapshot?: Record<string, unknown>;
}

export class SyncAmisCareersDto {
  @ApiProperty({ type: () => [SyncAmisCareerItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SyncAmisCareerItemDto)
  items: SyncAmisCareerItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class SyncAmisCareersResponseDto {
  @ApiProperty()
  syncedCount: number;

  @ApiProperty()
  createdCount: number;

  @ApiProperty()
  updatedCount: number;

  @ApiProperty()
  removedCount: number;

  @ApiProperty()
  skippedCount: number;

  @ApiProperty()
  lastSyncedAt: string;
}

export class AmisCareerCatalogItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  amisCareerId: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiPropertyOptional()
  organizationUnitId: string | null;

  @ApiPropertyOptional()
  organizationUnitName: string | null;

  @ApiPropertyOptional()
  usageStatus: number | null;

  @ApiProperty({ type: [String] })
  questionCategoryNames: string[];

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  lastSyncedAt: string;
}

export class UpdateAmisCareerQuestionCategoriesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  questionCategoryNames: string[];
}

export class CreateAmisCareerQuestionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  category: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  subcategory: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetLevels?: string[];

  @ApiPropertyOptional({ enum: QuestionType, default: QuestionType.OPEN_ENDED })
  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;

  @ApiPropertyOptional({ enum: CompetencyType })
  @IsOptional()
  @IsEnum(CompetencyType)
  competencyType?: CompetencyType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expectedAnswer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scoringGuide?: string;
}
