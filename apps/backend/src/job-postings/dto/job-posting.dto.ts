import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { FacebookPublishOptionsDto } from '../../facebook-publishing/dto/facebook-publish.dto';

export class ListJobPostingsQueryDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  jobDescriptionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  jobDescriptionVersionId?: string;

  @ApiPropertyOptional({
    enum: ['title', 'publicSlug', 'status', 'openAt', 'closeAt', 'createdAt', 'updatedAt'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['title', 'publicSlug', 'status', 'openAt', 'closeAt', 'createdAt', 'updatedAt'])
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}

export class CreateJobPostingDto {
  @ApiPropertyOptional({
    description: 'Accepted for FE compatibility; jobDescriptionVersionId is authoritative.',
  })
  @IsOptional()
  @IsUUID()
  jobDescriptionId?: string;

  @ApiProperty()
  @IsUUID()
  jobDescriptionVersionId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  publicSlug: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  openAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  closeAt?: string | null;
}

export class UpdateJobPostingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  publicSlug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  openAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  closeAt?: string | null;
}

export class PublishJobPostingDto {
  @ApiPropertyOptional({
    isArray: true,
    type: String,
    default: ['VCS_PORTAL'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  publishChannels?: string[];

  @ApiPropertyOptional({ type: FacebookPublishOptionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FacebookPublishOptionsDto)
  facebook?: FacebookPublishOptionsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  publishNote?: string;
}

export class CloseJobPostingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  closeAt?: string | null;
}
