import { ChannelPostingStatus } from '../recruitment-common';

export enum FacebookPublishTargetType {
  GROUP = 'GROUP',
  FANPAGE = 'FANPAGE',
}

export enum FacebookPublishResultStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

export interface ResolvedFacebookPublishTarget {
  targetId?: string | null;
  targetType: FacebookPublishTargetType;
  targetName: string;
  targetUrl?: string | null;
  targetExternalId?: string | null;
}

export interface CreateFacebookGroupInput {
  ownerUserId: string;
  targetName: string;
  targetUrl: string;
}

export interface UpdateFacebookGroupInput extends CreateFacebookGroupInput {
  targetId: string;
}

export interface ExtensionFacebookPublishPlan {
  jobPostingId: string;
  content: string;
  targets: ResolvedFacebookPublishTarget[];
  delay: {
    minMs: number;
    maxMs: number;
  };
}

export interface FacebookPublishResultItem {
  targetType: FacebookPublishTargetType;
  targetName: string;
  targetUrl?: string | null;
  targetId?: string | null;
  status: FacebookPublishResultStatus;
  message: string;
  externalPostId?: string | null;
}

export interface FacebookPublishSummary {
  success: boolean;
  totalTargets: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  status: ChannelPostingStatus;
  message?: string;
  results: FacebookPublishResultItem[];
}

export interface ReportFacebookPublishResultInput {
  jobPostingId: string;
  targetId?: string | null;
  targetType: FacebookPublishTargetType;
  targetName: string;
  targetUrl?: string | null;
  content?: string | null;
  status: FacebookPublishResultStatus;
  message: string;
  externalPostId?: string | null;
  submittedAt?: Date | null;
}
