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

export enum FacebookReviewStatus {
  POSTED = 'POSTED',
  PENDING_REVIEW = 'PENDING_REVIEW',
  REJECTED = 'REJECTED',
  DELETED = 'DELETED',
  UNKNOWN = 'UNKNOWN',
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
  lastDiscoveredAt?: string | null;
  todayPublishCount: number;
  dailyPublishLimit: number;
  quotaLabel: string;
  quotaExceeded: boolean;
  selectable: boolean;
  disabledReason?: string | null;
  ownerExtensionInstanceId?: string | null;
  lastVerifiedByInstanceId?: string | null;
  facebookAccountLabel?: string | null;
}

export interface CreateFacebookGroupInput {
  ownerUserId: string;
  targetName: string;
  targetUrl: string;
  ownerExtensionInstanceId?: string | null;
}

export interface UpdateFacebookGroupInput extends CreateFacebookGroupInput {
  targetId: string;
}

export interface UpdateFacebookGroupVerificationInput {
  ownerUserId: string;
  targetId: string;
  ownerExtensionInstanceId?: string | null;
  eligibilityStatus: FacebookPublishTargetEligibilityStatus;
  eligibilityReason?: string | null;
  verifiedAt?: Date | null;
  lastVerifiedByInstanceId?: string | null;
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
  facebookReviewStatus?: FacebookReviewStatus | null;
  message: string;
  externalPostId?: string | null;
  externalPostUrl?: string | null;
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
  facebookReviewStatus?: FacebookReviewStatus | null;
  message: string;
  externalPostId?: string | null;
  externalPostUrl?: string | null;
  submittedAt?: Date | null;
  extensionInstanceId?: string | null;
}

export interface ListFacebookPublishHistoriesInput {
  ownerUserId: string;
  targetId: string;
  facebookReviewStatus?: FacebookReviewStatus | null;
  page?: number | null;
  limit?: number | null;
}

export interface UpdateFacebookPublishHistoryStatusCheckInput {
  ownerUserId: string;
  historyId: string;
  facebookReviewStatus: FacebookReviewStatus;
  message?: string | null;
  externalPostUrl?: string | null;
  externalPostId?: string | null;
  checkedAt?: Date | null;
  extensionInstanceId?: string | null;
}
