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
  overview?: string | null;
  responsibilities?: string | null;
  requirements?: string | null;
  benefits?: Record<string, unknown> | null;
  salary?: string | null;
  annualLeaveDays?: string | null;
  department?: string | null;
  applicationDeadline?: string | null;
  status: string;
  sourceSystem?: string | null;
  sourceJobId?: string | null;
  sourceSlug?: string | null;
  sourceUrl?: string | null;
  sourceCreatedAt?: string | null;
  sourceModifiedAt?: string | null;
  sourceContentHash?: string | null;
  lastSyncedAt?: string | null;
  sourceCategories?: Array<{
    id: string;
    sourceSystem: string;
    sourceCategoryId?: string | null;
    name: string;
    displayName: string;
    slug: string;
  }>;
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

export interface JobDescriptionQuestionSetItem {
  id: string;
  questionSetItemId: string;
  questionId?: string | null;
  text: string;
  type: string;
  required: boolean;
  orderIndex: number;
  category?: string | null;
  subcategory?: string | null;
  competencyType?: string | null;
  difficulty?: number | null;
  targetLevels?: string[];
  expectedAnswer?: string | null;
  scoringGuide?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface JobDescriptionQuestionSetContext {
  jobDescription: JobDescriptionSummary;
  questionSet: {
    id: string;
    name: string;
    status: string;
    sourceSystem?: string | null;
    sourceJobId?: string | null;
    sourceLastSyncedAt?: string | null;
    updatedAt?: string | null;
  } | null;
  questions: JobDescriptionQuestionSetItem[];
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

export type ExtensionCapability =
  | 'AMIS_SYNC'
  | 'FACEBOOK_PUBLISH'
  | 'FACEBOOK_VERIFY'
  | 'CV_UPLOAD_TO_AMIS';

export type ExtensionInstanceStatus = 'ONLINE' | 'OFFLINE' | 'DISABLED';
export type ExtensionTaskType =
  | 'AMIS_SYNC'
  | 'FACEBOOK_PUBLISH'
  | 'FACEBOOK_VERIFY'
  | 'CV_UPLOAD_TO_AMIS';
export type ExtensionTaskStatus =
  | 'PENDING'
  | 'CLAIMED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELED';

export interface ExtensionInstance {
  id: string;
  ownerUserId: string;
  installId: string;
  displayName?: string | null;
  version?: string | null;
  status: ExtensionInstanceStatus;
  capabilities: ExtensionCapability[];
  lastSeenAt?: string | null;
  registeredAt: string;
  disabledAt?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExtensionTask {
  id: string;
  type: ExtensionTaskType;
  status: ExtensionTaskStatus;
  requestedByUserId: string;
  assignedInstanceId?: string | null;
  claimedByInstanceId?: string | null;
  lockedUntil?: string | null;
  payload?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  attemptCount: number;
  maxAttempts: number;
  priority: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

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
export type FacebookReviewStatus = 'POSTED' | 'PENDING_REVIEW' | 'REJECTED' | 'DELETED' | 'UNKNOWN';
export type FacebookPublishTargetEligibilityStatus = 'UNKNOWN' | 'CAN_POST' | 'CANNOT_POST';
export type FacebookPublishProgressStatus =
  | 'LOGIN_REQUIRED'
  | 'WAITING_LOGIN'
  | 'POSTING'
  | 'REPORTING'
  | 'DELAYING'
  | 'SUCCESS'
  | 'PARTIAL_SUCCESS'
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
  ownerExtensionInstanceId?: string | null;
  lastVerifiedByInstanceId?: string | null;
  facebookAccountLabel?: string | null;
}

export interface CreateFacebookGroupRequest {
  targetName: string;
  targetUrl: string;
}

export interface UpdateFacebookGroupRequest {
  targetName: string;
  targetUrl: string;
}

export interface DiscoverFacebookGroupsRequest {
  groups: Array<{
    targetName: string;
    targetUrl: string;
    targetExternalId?: string | null;
  }>;
  scanComplete?: boolean;
}

export interface FacebookGroupSyncState {
  status: 'NOT_INITIALIZED' | 'SYNCING' | 'READY' | 'PARTIAL' | 'FAILED';
  initialScanCompletedAt: string | null;
  lastScanStartedAt: string | null;
  lastScanCompletedAt: string | null;
  lastScannedCount: number;
  lastError: string | null;
}

export interface DiscoverFacebookGroupsResponse {
  requested: number;
  valid: number;
  created: number;
  updated: number;
  reactivated: number;
  duplicates: number;
  filtered: number;
  skipped: number;
  conflicts: number;
  errors: string[];
  removed: number;
  scanComplete: boolean;
  reconciliationApplied: boolean;
  items: Array<{
    action: 'created' | 'updated' | 'reactivated' | 'reused' | 'conflict' | 'deactivated' | 'skipped';
    targetName: string;
    targetUrl: string;
    targetExternalId: string | null;
    targetId: string | null;
    reason?: string | null;
  }>;
}

export interface VerifyFacebookGroupRequest {
  eligibilityStatus: FacebookPublishTargetEligibilityStatus;
  eligibilityReason?: string | null;
  verifiedAt?: string | null;
}

export type FacebookPublishAttachmentSource = 'LOCAL_UPLOAD' | 'AI_GENERATED';

export interface FacebookPublishImageAttachment {
  type: 'IMAGE';
  source: FacebookPublishAttachmentSource;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

export type FacebookPublishAttachment = FacebookPublishImageAttachment;

export type FacebookImageAttachFailureDecision = 'SKIP' | 'POST_TEXT_ONLY';

export interface FacebookImageAttachFailureContext {
  target: FacebookPublishTarget;
  attachment: FacebookPublishImageAttachment;
  message: string;
}

export interface FacebookPublishPlan {
  jobPostingId: string;
  content: string;
  targets: FacebookPublishTarget[];
  attachments?: FacebookPublishAttachment[];
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
  deleted: number;
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
  extensionInstanceId?: string | null;
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

export interface ExtensionPreviewPublishPlanResponse {
  amisRecruitmentId: string;
  snapshotHash: string;
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

export interface SyncVcsPortalJdWarning {
  code: string;
  message: string;
  sourceJobId?: string | null;
  sourceSlug?: string | null;
  page?: number | null;
}

export interface SyncVcsPortalJdsResponse {
  fetchedCount: number;
  pagesFetched: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  archivedCount: number;
  failedCount: number;
  questionSetCreatedCount: number;
  questionSetDeletedCount: number;
  questionCount: number;
  lastSyncedAt: string;
  warnings?: SyncVcsPortalJdWarning[];
}

export interface AmisApplicationListItem {
  applicationId: string;
  candidateId: string;
  amisCandidateId: string | null;
  candidateName: string;
  email: string | null;
  mobile: string | null;
  status: string;
  mappingStatus: string | null;
  aiScreeningStatus: string | null;
  mappingScore: number | null;
  aiScreeningScore: number | null;
  formStatus: string | null;
  latestForm: {
    formSessionId: string;
    status: string;
    expiresAt: string;
    sentAt: string | null;
    openedAt: string | null;
    submittedAt: string | null;
    createdAt: string;
  } | null;
  currentCvDocumentId: string | null;
  cvScanStatus: string | null;
  cvSanitizeStatus: string | null;
  cvParseStatus: string | null;
  cvDocumentType: string | null;
  sourceChannel: string | null;
  externalApplicationId: string | null;
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

export interface RunApplicationAiScreeningResponse {
  applicationId: string;
  status: string;
  mapping?: {
    status?: string | null;
  } | null;
  aiScreening?: {
    status?: string | null;
  } | null;
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
  | 'FACEBOOK_IMAGE_ATTACHMENTS_RESOLVED'
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
