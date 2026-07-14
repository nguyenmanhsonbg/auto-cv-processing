import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsDateString, IsDefined, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

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
    description: 'Filter by external source system such as VCS_PORTAL.',
  })
  @IsOptional()
  @IsString()
  sourceSystem?: string;

  @ApiPropertyOptional({
    description: 'When true, only returns source-synced JDs that have lastSyncedAt.',
  })
  @IsOptional()
  @IsBooleanString()
  latestSyncedOnly?: string;

  @ApiPropertyOptional({
    enum: ['title', 'status', 'createdAt', 'updatedAt', 'lastSyncedAt'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['title', 'status', 'createdAt', 'updatedAt', 'lastSyncedAt'])
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

  @ApiPropertyOptional({ description: 'Plain text overview synced from VCS Portal acf.overview.' })
  @IsOptional()
  @IsString()
  overview?: string | null;

  @ApiPropertyOptional({ description: 'Plain text responsibilities synced from VCS Portal acf.responsibilities.' })
  @IsOptional()
  @IsString()
  responsibilities?: string | null;

  @ApiProperty({
    description: 'Short job summary used by AMIS summary field. Maximum 500 characters.',
    maxLength: 500,
  })
  @IsString()
  @MaxLength(500)
  summary: string;

  @ApiProperty({
    description: 'Plain text requirements. VCS Portal maps this from acf.qualifications.',
  })
  @IsDefined()
  @IsString()
  requirements: string;

  @ApiPropertyOptional({
    description: 'JSON object or plain string. Plain string is stored as { text }.',
  })
  @IsOptional()
  benefits?: unknown;

  @ApiPropertyOptional({ description: 'Plain text salary synced from VCS Portal acf.salary.' })
  @IsOptional()
  @IsString()
  salary?: string | null;

  @ApiPropertyOptional({ description: 'Plain text annual leave days synced from VCS Portal acf.annual_leave_days.' })
  @IsOptional()
  @IsString()
  annualLeaveDays?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string | null;

  @ApiPropertyOptional({ description: 'Application deadline date in ISO yyyy-MM-dd format.' })
  @IsOptional()
  @IsDateString()
  applicationDeadline?: string | null;
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

  @ApiPropertyOptional({ description: 'Plain text overview synced from VCS Portal acf.overview.' })
  @IsOptional()
  @IsString()
  overview?: string | null;

  @ApiPropertyOptional({ description: 'Plain text responsibilities synced from VCS Portal acf.responsibilities.' })
  @IsOptional()
  @IsString()
  responsibilities?: string | null;

  @ApiPropertyOptional({
    description: 'Short job summary used by AMIS summary field. Maximum 500 characters.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @ApiPropertyOptional({
    description: 'Plain text requirements. VCS Portal maps this from acf.qualifications.',
  })
  @IsOptional()
  @IsString()
  requirements?: string;

  @ApiPropertyOptional({
    description: 'JSON object or plain string. Plain string is stored as { text }.',
  })
  @IsOptional()
  benefits?: unknown;

  @ApiPropertyOptional({ description: 'Plain text salary synced from VCS Portal acf.salary.' })
  @IsOptional()
  @IsString()
  salary?: string | null;

  @ApiPropertyOptional({ description: 'Plain text annual leave days synced from VCS Portal acf.annual_leave_days.' })
  @IsOptional()
  @IsString()
  annualLeaveDays?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string | null;

  @ApiPropertyOptional({ description: 'Application deadline date in ISO yyyy-MM-dd format.' })
  @IsOptional()
  @IsDateString()
  applicationDeadline?: string | null;
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
