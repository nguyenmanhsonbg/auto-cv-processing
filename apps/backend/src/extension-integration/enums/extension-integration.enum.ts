import { RecruitmentChannel } from '../../recruitment-common';

export enum ExtensionSourceSystem {
  AMIS = 'AMIS',
  VCS_PORTAL = 'VCS_PORTAL',
}

export enum ExtensionExternalEntityType {
  JOB_POSTING = 'JOB_POSTING',
}

export enum ExtensionInternalEntityType {
  JOB_POSTING = 'JOB_POSTING',
}

export enum ExtensionSyncAction {
  PUBLISH = 'PUBLISH',
}

export enum ExtensionSyncResultCode {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  DUPLICATE_OR_IDEMPOTENT_REPLAY = 'DUPLICATE_OR_IDEMPOTENT_REPLAY',
}

export enum ExtensionIdempotencyStatus {
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

export const EXTENSION_SYNC_CHANNELS = [
  RecruitmentChannel.VCS_PORTAL,
  RecruitmentChannel.FACEBOOK,
  RecruitmentChannel.TOPCV,
  RecruitmentChannel.ITVIEC,
  RecruitmentChannel.VIETNAMWORKS,
  RecruitmentChannel.LINKEDIN,
] as const;

export type ExtensionSyncChannel = (typeof EXTENSION_SYNC_CHANNELS)[number];
