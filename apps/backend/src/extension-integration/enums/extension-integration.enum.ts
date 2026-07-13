import { RecruitmentChannel } from '../../recruitment-common';

export enum ExtensionSourceSystem {
  AMIS = 'AMIS',
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

export enum ExtensionInstanceStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  DISABLED = 'DISABLED',
}

export enum ExtensionCapability {
  AMIS_SYNC = 'AMIS_SYNC',
  FACEBOOK_PUBLISH = 'FACEBOOK_PUBLISH',
  FACEBOOK_VERIFY = 'FACEBOOK_VERIFY',
  CV_UPLOAD_TO_AMIS = 'CV_UPLOAD_TO_AMIS',
}

export enum ExtensionTaskStatus {
  PENDING = 'PENDING',
  CLAIMED = 'CLAIMED',
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELED = 'CANCELED',
}

export enum ExtensionTaskType {
  AMIS_SYNC = 'AMIS_SYNC',
  FACEBOOK_PUBLISH = 'FACEBOOK_PUBLISH',
  FACEBOOK_VERIFY = 'FACEBOOK_VERIFY',
  CV_UPLOAD_TO_AMIS = 'CV_UPLOAD_TO_AMIS',
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
