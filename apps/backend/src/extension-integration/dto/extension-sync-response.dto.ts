import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChannelPostingStatus } from '../../recruitment-common';
import {
  EXTENSION_SYNC_CHANNELS,
  ExtensionSyncResultCode,
  type ExtensionSyncChannel,
} from '../enums/extension-integration.enum';

export class ExtensionSyncWarningDto {
  @ApiProperty()
  code: string;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional({ enum: EXTENSION_SYNC_CHANNELS })
  channel?: ExtensionSyncChannel;
}

export class ChannelPostingResultDto {
  @ApiPropertyOptional()
  channelPostingId?: string;

  @ApiProperty({ enum: EXTENSION_SYNC_CHANNELS })
  channel: ExtensionSyncChannel;

  @ApiProperty({ enum: ChannelPostingStatus, enumName: 'ChannelPostingStatus' })
  status: ChannelPostingStatus;

  @ApiPropertyOptional()
  publishedUrl?: string | null;

  @ApiPropertyOptional()
  externalPostingId?: string | null;

  @ApiPropertyOptional()
  errorCode?: string | null;

  @ApiPropertyOptional()
  manualActionRequired?: boolean;

  @ApiPropertyOptional()
  message?: string | null;

  @ApiPropertyOptional()
  lastSyncAt?: string | null;
}

export class ExtensionSyncResponseDto {
  @ApiProperty({ enum: ExtensionSyncResultCode, enumName: 'ExtensionSyncResultCode' })
  resultCode: ExtensionSyncResultCode;

  @ApiPropertyOptional()
  jobDescriptionId?: string;

  @ApiPropertyOptional()
  jobDescriptionVersionId?: string;

  @ApiPropertyOptional()
  jobPostingId?: string;

  @ApiProperty()
  amisRecruitmentId: string;

  @ApiProperty()
  snapshotHash: string;

  @ApiProperty()
  snapshotChanged: boolean;

  @ApiProperty({ type: () => [ChannelPostingResultDto] })
  channelPostings: ChannelPostingResultDto[];

  @ApiPropertyOptional({ type: () => [ExtensionSyncWarningDto] })
  warnings?: ExtensionSyncWarningDto[];
}
