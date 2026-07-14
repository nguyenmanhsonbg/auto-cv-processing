import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SyncVcsPortalJdWarningDto {
  @ApiProperty()
  code: string;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional()
  sourceJobId?: string | null;

  @ApiPropertyOptional()
  sourceSlug?: string | null;

  @ApiPropertyOptional()
  page?: number | null;
}

export class SyncVcsPortalJdsResponseDto {
  @ApiProperty()
  fetchedCount: number;

  @ApiProperty()
  pagesFetched: number;

  @ApiProperty()
  createdCount: number;

  @ApiProperty()
  updatedCount: number;

  @ApiProperty()
  unchangedCount: number;

  @ApiProperty()
  archivedCount: number;

  @ApiProperty()
  failedCount: number;

  @ApiProperty()
  questionSetCreatedCount: number;

  @ApiProperty()
  questionSetDeletedCount: number;

  @ApiProperty()
  questionCount: number;

  @ApiProperty()
  lastSyncedAt: string;

  @ApiPropertyOptional({ type: () => [SyncVcsPortalJdWarningDto] })
  warnings?: SyncVcsPortalJdWarningDto[];
}
