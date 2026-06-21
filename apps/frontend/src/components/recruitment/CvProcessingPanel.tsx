import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CleanCvActions } from '@/components/recruitment/CleanCvActions';
import type {
  ApplicationCvSummary,
  CvDocumentMetadataRecord,
  CvVersionRecord,
} from '@/lib/recruitment-api';
import { cn } from '@/lib/utils';

interface CvProcessingPanelProps {
  applicationId: string;
  currentCv?: ApplicationCvSummary | null;
  versions: CvVersionRecord[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  REQUESTED: 'Requested',
  SCANNING: 'Scanning',
  PASSED: 'Passed',
  FAILED: 'Failed',
  REJECTED_MALWARE: 'Rejected malware',
  SANITIZING: 'Sanitizing',
  SANITIZED: 'Sanitized',
  PARSING: 'Parsing',
  PARSED: 'Parsed',
  SUCCESS: 'Success',
};

function statusLabel(status?: string | null) {
  if (!status) return 'Unknown';
  return STATUS_LABELS[status] ?? status;
}

export function getCvStatusClassName(status?: string | null) {
  switch (status) {
    case 'PASSED':
    case 'SANITIZED':
    case 'PARSED':
    case 'SUCCESS':
      return 'bg-green-100 text-green-800';
    case 'FAILED':
    case 'REJECTED_MALWARE':
      return 'bg-red-100 text-red-800';
    case 'REQUESTED':
    case 'SCANNING':
    case 'SANITIZING':
    case 'PARSING':
    case 'PENDING':
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

function valueOrDash(value?: string | number | boolean | null) {
  if (value === undefined || value === null || value === '') return '-';
  return String(value);
}

function formatBytes(value?: number | null) {
  if (typeof value !== 'number') return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function shortHash(value?: string | null) {
  if (!value) return '-';
  return value.length > 16 ? `${value.slice(0, 12)}...` : value;
}

function findCurrentVersion(
  versions: CvVersionRecord[],
  currentCv?: ApplicationCvSummary | null,
) {
  return (
    versions.find((version) => version.isCurrent)
    ?? versions.find((version) => version.versionNo === currentCv?.versionNo)
    ?? versions[0]
    ?? null
  );
}

function StatusItem({
  label,
  status,
}: {
  label: string;
  status?: string | null;
}) {
  return (
    <div className="rounded-md border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <Badge className={cn('mt-2', getCvStatusClassName(status))}>
        {statusLabel(status)}
      </Badge>
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-medium">{value}</p>
    </div>
  );
}

function DocumentDetails({
  title,
  document,
}: {
  title: string;
  document?: CvDocumentMetadataRecord | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <DetailField label="Document ID" value={valueOrDash(document?.cvDocumentId)} />
        <DetailField label="File name" value={valueOrDash(document?.fileName)} />
        <DetailField label="File type" value={valueOrDash(document?.fileType)} />
        <DetailField label="File size" value={formatBytes(document?.fileSize)} />
        <DetailField label="Version" value={valueOrDash(document?.versionNo)} />
        <DetailField label="Created" value={formatDate(document?.createdAt)} />
        <DetailField label="Original hash" value={shortHash(document?.originalFileHash)} />
        <DetailField label="Clean hash" value={shortHash(document?.cleanFileHash)} />
        <DetailField label="Storage zone" value={valueOrDash(document?.storageZone)} />
        <DetailField
          label="Storage key recorded"
          value={valueOrDash(document?.storageKeyRecorded)}
        />
      </CardContent>
    </Card>
  );
}

export function CvProcessingPanel({
  applicationId,
  currentCv,
  versions,
  loading = false,
  error,
  onRefresh,
}: CvProcessingPanelProps) {
  const currentVersion = findCurrentVersion(versions, currentCv);
  const originalDocument = currentVersion?.original ?? null;
  const cleanDocument = currentVersion?.clean ?? null;
  const scanStatus = originalDocument?.scanStatus ?? cleanDocument?.scanStatus ?? currentCv?.scanStatus;
  const sanitizeStatus = cleanDocument?.sanitizeStatus
    ?? originalDocument?.sanitizeStatus
    ?? currentCv?.sanitizeStatus;
  const parseStatus = cleanDocument?.parseStatus ?? originalDocument?.parseStatus ?? currentCv?.parseStatus;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg">CV Processing</CardTitle>
            {onRefresh && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={onRefresh}
              >
                <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
                Refresh
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {loading && (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              Loading CV processing status...
            </div>
          )}

          {!loading && !currentVersion && (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              No CV version found for this application.
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <StatusItem label="Security scan" status={scanStatus} />
            <StatusItem label="Clean CV" status={sanitizeStatus} />
            <StatusItem label="Parsed profile" status={parseStatus} />
          </div>

          <div className="rounded-md border p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Clean CV access</p>
                <p className="mt-1 text-sm">
                  Preview and download use the safe clean-file endpoint only.
                </p>
              </div>
              <CleanCvActions
                applicationId={applicationId}
                cvDocument={cleanDocument}
                disabledReason="Clean CV is available only after sanitize succeeds."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <DocumentDetails title="Original CV Metadata" document={originalDocument} />
        <DocumentDetails title="Clean CV Metadata" document={cleanDocument} />
      </div>
    </div>
  );
}
