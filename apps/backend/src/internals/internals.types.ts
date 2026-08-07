import { ApplicationStatus, HrReviewDecisionType } from '../recruitment-common';

export enum ApplicationReferralSourceType {
  FREELANCER = 'FREELANCER',
  INTERNAL = 'INTERNAL',
}

export interface CreateInternalInput {
  email: string;
  name?: string | null;
  phone?: string | null;
  createdById?: string | null;
}

export interface ListInternalsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface ListInternalApplicationsParams {
  page?: number;
  limit?: number;
  search?: string;
  processStatus?: ApplicationStatus;
  hrReceptionStatus?: HrReviewDecisionType;
  sortOrder?: 'ASC' | 'DESC';
}

export interface InternalSummary {
  internalId: string;
  email: string;
  name: string | null;
  phone: string | null;
  isActive: boolean;
  applicationCount: number;
  createdBy: {
    userId: string;
    name: string;
    email: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InternalApplicationSummary {
  referralId: string;
  applicationId: string;
  candidate: {
    candidateId: string;
    fullName: string;
  };
  jobPosting: {
    jobPostingId: string;
    title: string;
  };
  processStatus: string | null;
  hrReceptionStatus: string | null;
  evaluation: string | null;
  appliedAt: Date;
  assignees: Array<{
    userId: string;
    name: string;
    email: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}
