import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDefined, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ListJobDescriptionsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Accepts backend status or FE aliases such as READY/JD_READY.',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  positionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  levelId?: string;

  @ApiPropertyOptional({
    enum: ['title', 'status', 'createdAt', 'updatedAt'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['title', 'status', 'createdAt', 'updatedAt'])
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}

export class CreateJobDescriptionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  positionId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  levelId?: string | null;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty({
    description: 'JSON object or plain string. Plain string is stored as { text }.',
  })
  @IsDefined()
  requirements: unknown;

  @ApiPropertyOptional({
    description: 'JSON object or plain string. Plain string is stored as { text }.',
  })
  @IsOptional()
  benefits?: unknown;
}

export class UpdateJobDescriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  positionId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  levelId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'JSON object or plain string. Plain string is stored as { text }.',
  })
  @IsOptional()
  requirements?: unknown;

  @ApiPropertyOptional({
    description: 'JSON object or plain string. Plain string is stored as { text }.',
  })
  @IsOptional()
  benefits?: unknown;
}

export class CreateJobDescriptionVersionDto {
  @ApiPropertyOptional({
    description: 'Accepted for FE compatibility. Current entity has no changeNote column.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeNote?: string;
}
