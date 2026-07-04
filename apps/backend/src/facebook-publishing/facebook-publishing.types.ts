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

export enum FacebookPublishTargetEligibilityStatus {
  UNKNOWN = 'UNKNOWN',
  CAN_POST = 'CAN_POST',
  CANNOT_POST = 'CANNOT_POST',
}

export interface ResolvedFacebookPublishTarget {
  targetId?: string | null;
  targetType: FacebookPublishTargetType;
  targetName: string;
  targetUrl?: string | null;
  targetExternalId?: string | null;
  eligibilityStatus: FacebookPublishTargetEligibilityStatus;
  eligibilityReason?: string | null;
  lastVerifiedAt?: string | null;
  todayPublishCount: number;
  dailyPublishLimit: number;
  quotaLabel: string;
  quotaExceeded: boolean;
  selectable: boolean;
  disabledReason?: string | null;
}

export interface CreateFacebookGroupInput {
  ownerUserId: string;
  targetName: string;
  targetUrl: string;
}

export interface UpdateFacebookGroupInput extends CreateFacebookGroupInput {
  targetId: string;
}

export interface UpdateFacebookGroupVerificationInput {
  ownerUserId: string;
  targetId: string;
  eligibilityStatus: FacebookPublishTargetEligibilityStatus;
  eligibilityReason?: string | null;
  verifiedAt?: Date | null;
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
