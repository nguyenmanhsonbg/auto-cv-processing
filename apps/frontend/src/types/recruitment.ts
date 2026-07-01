export type RecruitmentActorType = 'PUBLIC' | 'CANDIDATE' | 'HR' | 'ADMIN' | 'SYSTEM';

export enum ApplicationStatus {
  APPLICATION_CREATED = 'APPLICATION_CREATED',
  APPLICATION_VALIDATING = 'APPLICATION_VALIDATING',
  APPLICATION_REJECTED_INVALID = 'APPLICATION_REJECTED_INVALID',
  APPLICATION_DUPLICATE_CHECKING = 'APPLICATION_DUPLICATE_CHECKING',
  APPLICATION_DUPLICATE_FOUND = 'APPLICATION_DUPLICATE_FOUND',
  APPLICATION_OVERWRITTEN = 'APPLICATION_OVERWRITTEN',
  APPLICATION_REJECTED_RATE_LIMIT = 'APPLICATION_REJECTED_RATE_LIMIT',
  CV_UPLOADED = 'CV_UPLOADED',
  CV_STORED_QUARANTINE = 'CV_STORED_QUARANTINE',
  CV_SCAN_REQUESTED = 'CV_SCAN_REQUESTED',
  CV_SCAN_PASSED = 'CV_SCAN_PASSED',
  CV_SCAN_FAILED = 'CV_SCAN_FAILED',
  CV_REJECTED_MALWARE = 'CV_REJECTED_MALWARE',
  CV_SANITIZING = 'CV_SANITIZING',
  CV_SANITIZED = 'CV_SANITIZED',
  CV_SANITIZE_FAILED = 'CV_SANITIZE_FAILED',
  CV_PARSE_FAILED = 'CV_PARSE_FAILED',
  CV_PARSED = 'CV_PARSED',
}

export enum CvScanStatus {
  PENDING = 'PENDING',
  SCANNING = 'SCANNING',
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  REJECTED_MALWARE = 'REJECTED_MALWARE',
}

export enum CvSanitizeStatus {
  PENDING = 'PENDING',
  SANITIZING = 'SANITIZING',
  SANITIZED = 'SANITIZED',
  FAILED = 'FAILED',
}

export enum CvParseStatus {
  PENDING = 'PENDING',
  PARSING = 'PARSING',
  PARSED = 'PARSED',
  FAILED = 'FAILED',
}

export enum JobDescriptionStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  ARCHIVED = 'ARCHIVED',
}

export enum JobPostingStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  CLOSED = 'CLOSED',
  ARCHIVED = 'ARCHIVED',
}

export enum ApplicationSourceType {
  PORTAL = 'PORTAL',
  CHANNEL = 'CHANNEL',
  MANUAL_IMPORT = 'MANUAL_IMPORT',
  WEBHOOK = 'WEBHOOK',
  EMAIL_PARSE = 'EMAIL_PARSE',
  OTHER = 'OTHER',
}

export enum CvDocumentType {
  ORIGINAL = 'ORIGINAL',
  CLEAN = 'CLEAN',
}

export enum StorageZone {
  QUARANTINE = 'QUARANTINE',
  SAFE = 'SAFE',
}

export interface PaginatedRecruitmentResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RecruitmentUserSummary {
  id: string;
  name?: string | null;
  email?: string | null;
}

export interface RecruitmentCandidateSummary {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface JobDescription {
  id: string;
  title: string;
  summary?: string | null;
  description?: string | null;
  requirements?: string | null;
  responsibilities?: string | null;
  positionId?: string | null;
  levelId?: string | null;
  status: JobDescriptionStatus | string;
  currentVersionId?: string | null;
  createdById?: string | null;
  createdBy?: RecruitmentUserSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobDescriptionVersion {
  id: string;
  jobDescriptionId: string;
  versionNo: number;
  title: string;
  summary?: string | null;
  description?: string | null;
  requirements?: string | null;
  responsibilities?: string | null;
  isReady?: boolean;
  createdById?: string | null;
  createdBy?: RecruitmentUserSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobPosting {
  id: string;
  jobDescriptionId: string;
  jobDescriptionVersionId?: string | null;
  title: string;
  publicSlug: string;
  description?: string | null;
  requirements?: string | null;
  benefits?: string | null;
  location?: string | null;
  workingMode?: string | null;
  status: JobPostingStatus | string;
  publishedAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationSource {
  id: string;
  applicationId: string;
  sourceType: ApplicationSourceType | string;
  sourceChannel?: string | null;
  externalId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface Application {
  id: string;
  candidateId: string;
  candidate?: RecruitmentCandidateSummary | null;
  jobPostingId?: string | null;
  jobPosting?: Pick<JobPosting, 'id' | 'title' | 'publicSlug' | 'status'> | null;
  jobDescriptionVersionId?: string | null;
  status: ApplicationStatus | string;
  source?: ApplicationSourceType | string | null;
  sourceChannel?: string | null;
  currentCvDocumentId?: string | null;
  currentCvDocument?: CvDocument | null;
  createdAt: string;
  updatedAt: string;
}

export interface CvDocument {
  id: string;
  applicationId: string;
  candidateId?: string | null;
  documentType?: CvDocumentType | string;
  versionNo: number;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  storageZone?: StorageZone | string;
  originalFileHash?: string | null;
  cleanFileHash?: string | null;
  scanStatus: CvScanStatus | string;
  sanitizeStatus: CvSanitizeStatus | string;
  parseStatus: CvParseStatus | string;
  isCurrent?: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedProfile {
  id: string;
  applicationId: string;
  cvDocumentId: string;
  candidateId?: string | null;
  parserVersion?: string | null;
  parsedData?: Record<string, unknown> | null;
  rawText?: string | null;
  normalizedText?: string | null;
  normalizedTextHash?: string | null;
  parseConfidence?: number | null;
  warnings?: string[] | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  skills?: string[] | null;
  experience?: unknown[] | null;
  education?: unknown[] | string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowEvent {
  id: string;
  applicationId: string;
  fromStatus?: ApplicationStatus | string | null;
  toStatus: ApplicationStatus | string;
  message?: string | null;
  actorType?: RecruitmentActorType | string | null;
  actorId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  actorType?: RecruitmentActorType | string | null;
  actorId?: string | null;
  applicationId?: string | null;
  candidateId?: string | null;
  cvDocumentId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

