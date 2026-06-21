import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { ApplicationDetailRecord } from '@/lib/recruitment-api';

interface ApplicationOverviewProps {
  application: ApplicationDetailRecord;
}

const STATUS_LABELS: Record<string, string> = {
  APPLICATION_CREATED: 'Application created',
  APPLICATION_VALIDATING: 'Validating',
  APPLICATION_REJECTED_INVALID: 'Rejected invalid',
  APPLICATION_DUPLICATE_CHECKING: 'Duplicate checking',
  APPLICATION_DUPLICATE_FOUND: 'Duplicate found',
  APPLICATION_OVERWRITTEN: 'Overwritten',
  APPLICATION_REJECTED_RATE_LIMIT: 'Rate limited',
  CV_UPLOADED: 'CV uploaded',
  CV_STORED_QUARANTINE: 'CV stored',
  CV_SCAN_REQUESTED: 'CV scan requested',
  CV_SCAN_PASSED: 'CV scan passed',
  CV_SCAN_FAILED: 'CV scan failed',
  CV_REJECTED_MALWARE: 'Rejected malware',
  CV_SANITIZING: 'Sanitizing',
  CV_SANITIZED: 'CV sanitized',
  CV_SANITIZE_FAILED: 'Sanitize failed',
  CV_PARSED: 'CV parsed',
  CV_PARSE_FAILED: 'Parse failed',
  PROFILE_DUPLICATE_CHECKED: 'Profile checked',
  PROFILE_DUPLICATE_NEEDS_REVIEW: 'Profile review',
  MAPPING_REQUESTED: 'Mapping requested',
  MAPPING_DONE: 'Mapping done',
  MAPPING_FAILED: 'Mapping failed',
  MAPPING_REJECTED: 'Mapping rejected',
  ELIGIBLE_FOR_FORM: 'Eligible for form',
  FORM_SESSION_CREATED: 'Form created',
  FORM_SENT: 'Form sent',
  FORM_OPENED: 'Form opened',
  FORM_SUBMITTED: 'Form submitted',
  FORM_EXPIRED: 'Form expired',
  AI_SCREENING_REQUESTED: 'AI requested',
  AI_SCREENING_DONE: 'AI done',
  AI_SCREENING_FAILED: 'AI failed',
  WAITING_HR_REVIEW: 'Waiting HR review',
  HR_APPROVED: 'HR approved',
  HR_REJECTED: 'HR rejected',
  HR_REQUESTED_MORE_INFO: 'More info requested',
  TALENT_POOL: 'Talent pool',
};

function statusLabel(status?: string | null) {
  if (!status) return 'Unknown';
  return STATUS_LABELS[status] ?? status;
}

function statusClassName(status?: string | null) {
  switch (status) {
    case 'CV_SCAN_PASSED':
    case 'CV_SANITIZED':
    case 'CV_PARSED':
    case 'MAPPING_DONE':
    case 'FORM_SUBMITTED':
    case 'AI_SCREENING_DONE':
    case 'HR_APPROVED':
    case 'TALENT_POOL':
      return 'bg-green-100 text-green-800';
    case 'APPLICATION_REJECTED_INVALID':
    case 'APPLICATION_REJECTED_RATE_LIMIT':
    case 'CV_SCAN_FAILED':
    case 'CV_REJECTED_MALWARE':
    case 'CV_SANITIZE_FAILED':
    case 'CV_PARSE_FAILED':
    case 'MAPPING_FAILED':
    case 'MAPPING_REJECTED':
    case 'AI_SCREENING_FAILED':
    case 'HR_REJECTED':
      return 'bg-red-100 text-red-800';
    case 'APPLICATION_DUPLICATE_CHECKING':
    case 'APPLICATION_DUPLICATE_FOUND':
    case 'CV_SCAN_REQUESTED':
    case 'CV_SANITIZING':
    case 'PROFILE_DUPLICATE_NEEDS_REVIEW':
    case 'FORM_SENT':
    case 'FORM_OPENED':
    case 'WAITING_HR_REVIEW':
    case 'HR_REQUESTED_MORE_INFO':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-blue-100 text-blue-800';
  }
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function valueOrDash(value?: string | number | null) {
  if (value === undefined || value === null || value === '') return '-';
  return String(value);
}

function scoreLabel(value?: number | null) {
  return typeof value === 'number' ? `${value}` : '-';
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-1 break-words font-medium">{value}</div>
    </div>
  );
}

export { statusLabel as getApplicationStatusLabel, statusClassName as getApplicationStatusClassName };

export function ApplicationOverview({ application }: ApplicationOverviewProps) {
  const candidate = application.candidate;
  const jobPosting = application.jobPosting;
  const cv = application.cv;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg">Application Overview</CardTitle>
            <Badge className={statusClassName(application.status)}>
              {statusLabel(application.status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailField label="Application ID" value={application.applicationId} />
            <DetailField label="Source" value={valueOrDash(application.source)} />
            <DetailField label="Source channel" value={valueOrDash(application.sourceChannel)} />
            <DetailField label="External ID" value={valueOrDash(application.externalApplicationId)} />
          </div>
          <Separator />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailField label="Created" value={formatDate(application.createdAt)} />
            <DetailField label="Updated" value={formatDate(application.updatedAt)} />
            <DetailField label="Mapping score" value={scoreLabel(application.mapping?.score)} />
            <DetailField label="AI score" value={scoreLabel(application.aiScreening?.score)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Candidate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailField label="Name" value={valueOrDash(candidate?.fullName)} />
            <DetailField label="Email" value={valueOrDash(candidate?.email)} />
            <DetailField label="Phone" value={valueOrDash(candidate?.phone)} />
            <DetailField label="Candidate ID" value={valueOrDash(candidate?.candidateId)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Job</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailField
              label="Posting"
              value={
                jobPosting?.jobPostingId ? (
                  <Link
                    to={`/recruitment/job-postings/${jobPosting.jobPostingId}`}
                    className="hover:underline"
                  >
                    {jobPosting.title ?? jobPosting.jobPostingId}
                  </Link>
                ) : valueOrDash(jobPosting?.title)
              }
            />
            <DetailField
              label="JD version"
              value={valueOrDash(jobPosting?.jobDescriptionVersionId)}
            />
            <DetailField label="Posting ID" value={valueOrDash(jobPosting?.jobPostingId)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current CV Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailField label="CV document" value={valueOrDash(cv?.currentCvDocumentId)} />
            <DetailField label="File name" value={valueOrDash(cv?.originalFileName)} />
            <DetailField label="Version" value={valueOrDash(cv?.versionNo)} />
            <DetailField label="Updated" value={formatDate(cv?.createdAt)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
