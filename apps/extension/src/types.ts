export type UserRole = 'ADMIN' | 'HR' | 'INTERVIEWER';

export interface ExtensionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface ApiPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface JobDescriptionSummary {
  id: string;
  jobDescriptionId?: string;
  title: string;
  position?: {
    id: string;
    name: string;
    description?: string | null;
  } | null;
  level?: {
    id: string;
    name: string;
    displayName?: string | null;
    orderIndex?: number | null;
  } | null;
  summary?: string | null;
  description: string;
  requirements?: Record<string, unknown> | null;
  benefits?: Record<string, unknown> | null;
  status: string;
  createdBy?: {
    id: string;
    email?: string | null;
    name?: string | null;
    role?: string | null;
  } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AmisCareerCatalogItem {
  id: string;
  amisCareerId: string;
  name: string;
  description: string | null;
  organizationUnitId: string | null;
  organizationUnitName: string | null;
  usageStatus: number | null;
  questionCategoryNames: string[];
  isActive: boolean;
  lastSyncedAt: string;
}

export interface ExtensionQuestion {
  id: string;
  category: string;
  subcategory: string;
  competencyType?: string | null;
  text: string;
  difficulty: number;
  targetLevels: string[];
  type: string;
  expectedAnswer?: string | null;
  scoringGuide?: string | null;
  isActive: boolean;
}

export interface AmisCareerQuestionCategory {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  subcategories: Array<{
    id: string;
    name: string;
    competencyType?: string | null;
    orderIndex: number;
  }>;
}

export interface AmisCareerQuestionContext {
  career: AmisCareerCatalogItem;
  categories: AmisCareerQuestionCategory[];
  questions: ExtensionQuestion[];
}

export interface CreateAmisCareerQuestionRequest {
  category: string;
  subcategory: string;
  text: string;
  difficulty?: number;
  targetLevels?: string[];
  expectedAnswer?: string;
  scoringGuide?: string;
}

export interface AmisSelectedCareerResult {
  ok: boolean;
  careerName?: string;
  pageUrl: string;
  error?: string;
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
  summary?: string;
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
  selectedQuestionIds?: string[];
  facebookContent?: string;
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
export type FacebookPublishResultStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
export type FacebookReviewStatus = 'POSTED' | 'PENDING_REVIEW' | 'REJECTED' | 'UNKNOWN';
export type FacebookPublishTargetEligibilityStatus = 'UNKNOWN' | 'CAN_POST' | 'CANNOT_POST';
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
}


export interface CreateFacebookGroupRequest {
  targetName: string;
  targetUrl: string;
}

export interface UpdateFacebookGroupRequest {
  targetName: string;
  targetUrl: string;
}

export interface VerifyFacebookGroupRequest {
  eligibilityStatus: FacebookPublishTargetEligibilityStatus;
  eligibilityReason?: string | null;
  verifiedAt?: string | null;
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
  facebookReviewStatus?: FacebookReviewStatus | null;
  message: string;
  externalPostId?: string | null;
  externalPostUrl?: string | null;
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

export interface FacebookPublishHistorySummary {
  total: number;
  posted: number;
  pendingReview: number;
  rejected: number;
  unknown: number;
}

export interface FacebookPublishHistoryListItem {
  id: string;
  jobPostingId: string;
  title: string;
  contentPreview?: string | null;
  targetId?: string | null;
  targetName: string;
  targetUrl?: string | null;
  targetExternalId?: string | null;
  publishStatus: FacebookPublishResultStatus;
  facebookReviewStatus: FacebookReviewStatus;
  message?: string | null;
  errorReason?: string | null;
  submittedAt?: string | null;
  lastStatusCheckedAt?: string | null;
  lastStatusCheckMessage?: string | null;
  externalPostId?: string | null;
  externalPostUrl?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface FacebookPublishHistoriesResponse {
  summary: FacebookPublishHistorySummary;
  items: FacebookPublishHistoryListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface FacebookPublishHistoryStatusCheckRequest {
  facebookReviewStatus: FacebookReviewStatus;
  message?: string | null;
  externalPostUrl?: string | null;
  externalPostId?: string | null;
  checkedAt?: string | null;
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

export interface AmisCareerItem {
  amisCareerId: string;
  code?: string;
  name: string;
  description?: string;
  organizationUnitId?: string;
  organizationUnitName?: string;
  usageStatus?: number;
  parentAmisCareerId?: string;
  sortOrder?: number;
  isActive?: boolean;
  rawSnapshot?: Record<string, unknown>;
}

export interface SyncAmisCareersRequest {
  items: AmisCareerItem[];
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface SyncAmisCareersResponse {
  syncedCount: number;
  createdCount: number;
  updatedCount: number;
  removedCount: number;
  skippedCount: number;
  lastSyncedAt: string;
}

export interface AmisApplicationItem {
  recruitmentId: string;
  recruitmentRoundId: string;
  candidateId: string;
  candidateConvertId?: string;
  candidateName: string;
  email?: string;
  mobile?: string;
  birthday?: string;
  recruitmentRoundName?: string;
  status?: number;
  channelName?: string;
  applyDate?: string;
  recruitmentTitle?: string;
  attachmentCvId?: string;
  attachmentCvName?: string;
  educationDegreeName?: string;
  educationMajorName?: string;
  workPlaceRecent?: string;
  rawSnapshot?: Record<string, unknown>;
}

export interface SyncAmisApplicationsRequest {
  items: AmisApplicationItem[];
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface SyncAmisApplicationsResponse {
  syncedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  jobPostingId: string;
  amisRecruitmentId: string;
  lastSyncedAt: string;
}

export interface AmisApplicationListItem {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  email: string | null;
  mobile: string | null;
  status: string;
  currentCvDocumentId: string | null;
  cvScanStatus: string | null;
  cvSanitizeStatus: string | null;
  cvParseStatus: string | null;
  cvDocumentType: string | null;
  sourceChannel: string | null;
  externalApplicationId: string | null;
  amisCandidateId: string | null;
  amisRecruitmentRoundId: string | null;
  amisRecruitmentRoundName: string | null;
  amisStatus: number | null;
  attachmentCvId: string | null;
  attachmentCvName: string | null;
  applyDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AmisApplicationsForRecruitment {
  amisRecruitmentId: string;
  jobPostingId: string;
  total: number;
  applications: AmisApplicationListItem[];
}

export interface AmisCareerFetchResponse {
  ok: boolean;
  sourceUrl: string;
  items: AmisCareerItem[];
  rawCount: number;
  error?: string;
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
  | 'DEBUGGER_CAREER_RESPONSE_SEEN'
  | 'DEBUGGER_APPLICATIONS_RESPONSE_SEEN'
  | 'DEBUGGER_GET_BODY_FAILED'
  | 'AMIS_API_REQUEST_STARTED'
  | 'AMIS_API_RESPONSE_SEEN'
  | 'SAVE_REQUEST_SEEN'
  | 'SAVE_XHR_RESPONSE_SEEN'
  | 'SAVE_REQUEST_STARTED'
  | 'SAVE_RESPONSE_EMPTY'
  | 'SAVE_RESPONSE_READ_FAILED'
  | 'SAVE_RESPONSE_HTTP_ERROR'
  | 'SAVE_RESPONSE_UNMAPPED'
  | 'CAPTURE_PUBLISHED'
  | 'CAREER_RESPONSE_UNMAPPED'
  | 'CAREER_CAPTURE_PUBLISHED'
  | 'CAREER_AUTO_SYNC_SUCCESS'
  | 'CAREER_AUTO_SYNC_SKIPPED'
  | 'CAREER_AUTO_SYNC_FAILED'
  | 'APPLICATIONS_RESPONSE_UNMAPPED'
  | 'APPLICATIONS_CAPTURE_PUBLISHED'
  | 'APPLICATIONS_AUTO_SYNC_SUCCESS'
  | 'APPLICATIONS_AUTO_SYNC_SKIPPED'
  | 'APPLICATIONS_AUTO_SYNC_FAILED'
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
