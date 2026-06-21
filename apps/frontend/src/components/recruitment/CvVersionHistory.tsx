import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CleanCvActions } from '@/components/recruitment/CleanCvActions';
import {
  getCvStatusClassName,
} from '@/components/recruitment/CvProcessingPanel';
import type { CvVersionRecord } from '@/lib/recruitment-api';
import { cn } from '@/lib/utils';

interface CvVersionHistoryProps {
  applicationId: string;
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
  if (!status) return '-';
  return STATUS_LABELS[status] ?? status;
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

function shortHash(value?: string | null) {
  if (!value) return '-';
  return value.length > 16 ? `${value.slice(0, 12)}...` : value;
}

function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-muted-foreground">-</span>;

  return (
    <Badge className={cn('whitespace-nowrap', getCvStatusClassName(status))}>
      {statusLabel(status)}
    </Badge>
  );
}

export function CvVersionHistory({
  applicationId,
  versions,
  loading = false,
  error,
  onRefresh,
}: CvVersionHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg">CV Version History</CardTitle>
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
            Loading CV versions...
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Current</TableHead>
              <TableHead>Original file</TableHead>
              <TableHead>Original hash</TableHead>
              <TableHead>Clean hash</TableHead>
              <TableHead>Scan</TableHead>
              <TableHead>Sanitize</TableHead>
              <TableHead>Parse</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Clean CV</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && versions.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="h-20 text-center text-muted-foreground">
                  No CV versions found.
                </TableCell>
              </TableRow>
            )}

            {versions.map((version) => {
              const original = version.original;
              const clean = version.clean;
              const scanStatus = original?.scanStatus ?? clean?.scanStatus;
              const sanitizeStatus = clean?.sanitizeStatus ?? original?.sanitizeStatus;
              const parseStatus = clean?.parseStatus ?? original?.parseStatus;

              return (
                <TableRow key={version.versionNo}>
                  <TableCell className="font-medium">v{version.versionNo}</TableCell>
                  <TableCell>
                    {version.isCurrent ? (
                      <Badge className="bg-green-100 text-green-800">Current</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate">
                    {valueOrDash(original?.fileName)}
                  </TableCell>
                  <TableCell>{shortHash(original?.originalFileHash)}</TableCell>
                  <TableCell>{shortHash(clean?.cleanFileHash)}</TableCell>
                  <TableCell>
                    <StatusBadge status={scanStatus} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={sanitizeStatus} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={parseStatus} />
                  </TableCell>
                  <TableCell>{formatDate(clean?.createdAt ?? original?.createdAt)}</TableCell>
                  <TableCell>
                    <CleanCvActions
                      applicationId={applicationId}
                      cvDocument={clean}
                      disabledReason="Clean CV is available only after sanitize succeeds."
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
