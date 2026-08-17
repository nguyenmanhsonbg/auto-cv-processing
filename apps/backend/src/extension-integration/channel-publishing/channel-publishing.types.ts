import { RecruitmentChannel } from '../../recruitment-common';

export type MappedFormFieldSource = 'JOB_POSTING' | 'DEFAULT' | 'USER_REQUIRED';

export interface MappedFormField<T = unknown> {
  value: T | null;
  source: MappedFormFieldSource;
  editable: boolean;
  required: boolean;
  warning?: string;
}

export interface ChannelPublishWarning {
  code: string;
  field?: string;
  message: string;
}

export interface ChannelPublishInput {
  jobPostingId: string;
  actorUserId: string;
  extensionInstanceId?: string | null;
}

export interface ChannelPrepareResult {
  channel: RecruitmentChannel;
  jobPostingId: string;
  snapshotHash: string;
  executionMode: 'DIRECT_API' | 'EXTENSION';
  form: Record<string, unknown>;
  missingRequiredFields: string[];
  warnings: ChannelPublishWarning[];
  auth?: {
    required: boolean;
    host: string;
    tokenKey: string;
    expirationKey: string;
    publishRequiresBearer: boolean;
    exchangeTokenUrl: string;
  };
}

export interface ChannelPublisher {
  readonly channel: RecruitmentChannel;
  readonly executionMode: 'DIRECT_API' | 'EXTENSION';
  prepare(input: ChannelPublishInput): Promise<ChannelPrepareResult>;
}
