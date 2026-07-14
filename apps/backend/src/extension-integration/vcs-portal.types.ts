export interface VcsPortalFetchResult {
  items: VcsPortalRawJobDescription[];
  fetchedCount: number;
  pagesFetched: number;
}

export interface VcsPortalRawJobDescription extends Record<string, unknown> {
  id?: unknown;
  title?: unknown;
  slug?: unknown;
  url?: unknown;
  date?: unknown;
  modified?: unknown;
  categories?: unknown;
  content?: unknown;
  excerpt?: unknown;
  acf?: unknown;
  questions?: unknown;
}

export interface VcsPortalAcfFields extends Record<string, unknown> {
  end_date?: unknown;
  department?: unknown;
  overview?: unknown;
  responsibilities?: unknown;
  qualifications?: unknown;
  salary?: unknown;
  annual_leave_days?: unknown;
  insurance?: unknown;
  awards?: unknown;
  office?: unknown;
  celebration?: unknown;
  enable_job_questions?: unknown;
  job_questions?: unknown;
}

export interface VcsPortalMappedQuestion {
  text: string;
  type: string;
  required: boolean;
  placeholder: string | null;
  rawSnapshot: Record<string, unknown> | string;
}

export interface VcsPortalMappedSourceCategory {
  sourceCategoryId: string | null;
  name: string;
  displayName: string;
  slug: string;
}

export interface VcsPortalMappedWarning {
  code: string;
  message: string;
}

export interface VcsPortalMappedJobDescription {
  sourceJobId: string;
  title: string;
  sourceSlug: string | null;
  sourceUrl: string | null;
  sourceCreatedAt: Date | null;
  sourceModifiedAt: Date | null;
  description: string;
  overview: string | null;
  responsibilities: string | null;
  summary: string;
  requirements: string;
  benefits: Record<string, unknown> | null;
  salary: string | null;
  annualLeaveDays: string | null;
  department: string | null;
  applicationDeadline: string | null;
  sourcePayload: Record<string, unknown>;
  sourceContentHash: string;
  categories: VcsPortalMappedSourceCategory[];
  questions: VcsPortalMappedQuestion[];
  warnings: VcsPortalMappedWarning[];
}
