import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDefined, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AmisJobSnapshotDto } from './sync-amis-job-posting.dto';

export class SyncAmisJobDescriptionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  amisRecruitmentId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  amisUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  templateJobDescriptionId?: string;

  @ApiProperty({ type: () => AmisJobSnapshotDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => AmisJobSnapshotDto)
  snapshot: AmisJobSnapshotDto;
}

export class SyncAmisJobDescriptionResponseDto {
  @ApiProperty({ enum: ['CREATED', 'UPDATED', 'UNCHANGED'] })
  resultCode: 'CREATED' | 'UPDATED' | 'UNCHANGED';

  @ApiProperty()
  amisRecruitmentId: string;

  @ApiProperty()
  jobDescription: {
    id: string;
    jobDescriptionId: string;
    title: string;
    summary: string | null;
    description: string;
    requirements: string;
    benefits: Record<string, unknown> | null;
    applicationDeadline: string | null;
    status: string;
    sourceSystem: string | null;
    sourceJobId: string | null;
    sourceUrl: string | null;
    sourceContentHash: string | null;
    lastSyncedAt: string | null;
  };
}
