import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class SyncAmisApplicationItemDto {
  @ApiProperty()
  @IsString()
  recruitmentId: string;

  @ApiProperty()
  @IsString()
  recruitmentRoundId: string;

  @ApiProperty()
  @IsString()
  candidateId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  candidateConvertId?: string;

  @ApiProperty()
  @IsString()
  candidateName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  birthday?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recruitmentRoundName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  status?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  channelName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  applyDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recruitmentTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attachmentCvId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attachmentCvName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  educationDegreeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  educationMajorName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workPlaceRecent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  rawSnapshot?: Record<string, unknown>;
}

export class SyncAmisApplicationsDto {
  @ApiProperty({ type: () => [SyncAmisApplicationItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncAmisApplicationItemDto)
  items: SyncAmisApplicationItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class SyncAmisApplicationsResponseDto {
  @ApiProperty()
  syncedCount: number;

  @ApiProperty()
  createdCount: number;

  @ApiProperty()
  updatedCount: number;

  @ApiProperty()
  skippedCount: number;

  @ApiProperty()
  jobPostingId: string;

  @ApiProperty()
  amisRecruitmentId: string;

  @ApiProperty()
  lastSyncedAt: string;
}

export class AmisApplicationLatestFormDto {
  @ApiProperty()
  formSessionId: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  expiresAt: string;

  @ApiPropertyOptional()
  sentAt: string | null;

  @ApiPropertyOptional()
  openedAt: string | null;

  @ApiPropertyOptional()
  submittedAt: string | null;

  @ApiProperty()
  createdAt: string;
}

export class AmisApplicationListItemDto {
  @ApiProperty()
  applicationId: string;

  @ApiProperty()
  candidateId: string;

  @ApiPropertyOptional()
  amisCandidateId: string | null;

  @ApiProperty()
  candidateName: string;

  @ApiPropertyOptional()
  email: string | null;

  @ApiPropertyOptional()
  mobile: string | null;

  @ApiProperty()
  status: string;

  @ApiPropertyOptional({ nullable: true })
  mappingStatus: string | null;

  @ApiPropertyOptional({ nullable: true })
  aiScreeningStatus: string | null;

  @ApiPropertyOptional({ nullable: true })
  mappingScore: number | null;

  @ApiPropertyOptional({ nullable: true })
  aiScreeningScore: number | null;

  @ApiPropertyOptional()
  formStatus: string | null;

  @ApiPropertyOptional({ type: () => AmisApplicationLatestFormDto, nullable: true })
  latestForm: AmisApplicationLatestFormDto | null;

  @ApiPropertyOptional()
  currentCvDocumentId: string | null;

  @ApiPropertyOptional()
  cvScanStatus: string | null;

  @ApiPropertyOptional()
  cvSanitizeStatus: string | null;

  @ApiPropertyOptional()
  cvParseStatus: string | null;

  @ApiPropertyOptional()
  cvDocumentType: string | null;

  @ApiPropertyOptional()
  sourceChannel: string | null;

  @ApiPropertyOptional()
  externalApplicationId: string | null;

  @ApiPropertyOptional()
  amisRecruitmentRoundId: string | null;

  @ApiPropertyOptional()
  amisRecruitmentRoundName: string | null;

  @ApiPropertyOptional()
  amisStatus: number | null;

  @ApiPropertyOptional()
  attachmentCvId: string | null;

  @ApiPropertyOptional()
  attachmentCvName: string | null;

  @ApiPropertyOptional()
  applyDate: string | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

export class AmisApplicationsForRecruitmentDto {
  @ApiProperty()
  amisRecruitmentId: string;

  @ApiProperty()
  jobPostingId: string;

  @ApiProperty()
  total: number;

  @ApiProperty({ type: () => [AmisApplicationListItemDto] })
  applications: AmisApplicationListItemDto[];
}
