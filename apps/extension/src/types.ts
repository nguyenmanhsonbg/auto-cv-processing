export type UserRole = 'ADMIN' | 'HR' | 'INTERVIEWER';

export interface ExtensionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export type ExtensionChannel =
  | 'VCS_PORTAL'
  | 'FACEBOOK'
  | 'TOPCV'
  | 'ITVIEC'
  | 'VIETNAMWORKS'
  | 'LINKEDIN';

export interface AmisJobRequirements {
  rawText: string;
  sections?: Array<{
    title?: string;
    items: string[];
  }>;
  mustHaveSkills?: string[];
  niceToHaveSkills?: string[];
  minExperienceYears?: number;
  education?: string;
  languages?: string[];
  certifications?: string[];
  notes?: string;
}

export interface AmisJobSnapshot {
  title: string;
  description: string;
  requirements: AmisJobRequirements;
  benefits?: Record<string, unknown> | string | null;
  location?: string;
  deadline?: string;
}

export interface SyncAmisJobPostingRequest {
  sourceSystem: 'AMIS';
  amisRecruitmentId: string;
  amisUrl?: string;
  action: 'PUBLISH';
  snapshot: AmisJobSnapshot;
  channels: ExtensionChannel[];
  facebookTargetIds?: string[];
  metadata?: Record<string, unknown>;
}

export type AmisExtractionStatus =
  | 'AMIS_PAGE_DETECTED'
  | 'UNSUPPORTED_PAGE'
  | 'EXTRACTION_FAILED';

export type AmisCaptureSource = 'DOM_HEURISTIC' | 'AMIS_SAVE_RECRUITMENT_API';

export type AmisExtractionConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AmisExtractionResult {
  status: AmisExtractionStatus;
  detected: boolean;
  source: AmisCaptureSource;
  confidence: AmisExtractionConfidence;
  url: string;
  amisRecruitmentId?: string;
  snapshot?: AmisJobSnapshot;
  missingFields: string[];
  warnings: string[];
  evidence: {
    host: string;
    title?: string;
    markers: string[];
    fieldSources: Record<string, string>;
  };
}

export interface ChannelPostingResult {
  channel: ExtensionChannel;
  status: string;
  publishedUrl?: string | null;
  externalPostingId?: string | null;
  errorCode?: string | null;
  manualActionRequired?: boolean;
  message?: string | null;
  lastSyncAt?: string | null;
}

export type FacebookPublishTargetType = 'GROUP' | 'FANPAGE';
export type FacebookPublishResultStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';
export type FacebookPublishProgressStatus =
  | 'LOGIN_REQUIRED'
  | 'WAITING_LOGIN'
  | 'POSTING'
  | 'REPORTING'
  | 'DELAYING'
  | 'SUCCESS'
  | 'ERROR';

export interface FacebookPublishTarget {
  targetId?: string | null;
  targetType: FacebookPublishTargetType;
  targetName: string;
  targetUrl?: string | null;
  targetExternalId?: string | null;
}

export interface CreateFacebookGroupRequest {
  targetName: string;
  targetUrl: string;
}

export interface UpdateFacebookGroupRequest {
  targetName: string;
  targetUrl: string;
}

export interface FacebookPublishPlan {
  jobPostingId: string;
  content: string;
  targets: FacebookPublishTarget[];
  delay: {
    minMs: number;
    maxMs: number;
  };
}

export interface FacebookPublishResultPayload {
  jobPostingId: string;
  targetId?: string | null;
  targetType: FacebookPublishTargetType;
  targetName: string;
  targetUrl?: string | null;
  content?: string | null;
  status: FacebookPublishResultStatus;
  message: string;
  externalPostId?: string | null;
  submittedAt?: string | null;
}

export interface FacebookPublishProgress {
  status: FacebookPublishProgressStatus;
  currentIndex: number;
  total: number;
  target?: FacebookPublishTarget;
  message: string;
  results: FacebookPublishResultPayload[];
}

export interface ExtensionSyncResponse {
  resultCode: 'CREATED' | 'UPDATED' | 'DUPLICATE_OR_IDEMPOTENT_REPLAY';
  jobDescriptionId?: string;
  jobDescriptionVersionId?: string;
  jobPostingId?: string;
  amisRecruitmentId: string;
  snapshotHash: string;
  snapshotChanged: boolean;
  channelPostings: ChannelPostingResult[];
  facebookPublishPlan?: FacebookPublishPlan;
  warnings?: Array<{
    code: string;
    message: string;
    channel?: ExtensionChannel;
  }>;
}

export type AmisAutoSyncStatus =
  | 'IDLE'
  | 'SYNCING'
  | 'SUCCESS'
  | 'ERROR'
  | 'AUTH_REQUIRED'
  | 'SKIPPED';

export interface AmisAutoSyncState {
  status: AmisAutoSyncStatus;
  capture?: AmisExtractionResult;
  result?: ExtensionSyncResponse;
  error?: {
    code: string;
    message: string;
    status?: number;
  };
  channels?: ExtensionChannel[];
  updatedAt: string;
}

export type AmisDiagnosticEventType =
  | 'BRIDGE_READY'
  | 'HOOK_READY'
  | 'DEBUGGER_ATTACHED'
  | 'DEBUGGER_ATTACH_FAILED'
  | 'DEBUGGER_DETACHED'
  | 'DEBUGGER_SAVE_RESPONSE_SEEN'
  | 'DEBUGGER_GET_BODY_FAILED'
  | 'AMIS_API_REQUEST_STARTED'
  | 'AMIS_API_RESPONSE_SEEN'
  | 'SAVE_REQUEST_SEEN'
  | 'SAVE_REQUEST_STARTED'
  | 'SAVE_RESPONSE_EMPTY'
  | 'SAVE_RESPONSE_READ_FAILED'
  | 'SAVE_RESPONSE_HTTP_ERROR'
  | 'SAVE_RESPONSE_UNMAPPED'
  | 'CAPTURE_PUBLISHED'
  | 'BACKGROUND_RECEIVED_CAPTURE';

export interface AmisDiagnosticEvent {
  type: AmisDiagnosticEventType;
  pageUrl: string;
  timestamp: string;
  requestUrl?: string;
  frameUrl?: string;
  details?: Record<string, unknown>;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown[];
  };
  meta?: {
    timestamp?: string;
    requestId?: string;
    idempotencyKey?: string | null;
    extensionVersion?: string | null;
  };
}
