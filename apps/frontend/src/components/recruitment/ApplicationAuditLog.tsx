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
import type {
  ApplicationAuditLogRecord,
  RecruitmentPagination,
} from '@/lib/recruitment-api';
import { cn } from '@/lib/utils';

interface ApplicationAuditLogProps {
  logs: ApplicationAuditLogRecord[];
  pagination?: RecruitmentPagination;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

const BLOCKED_METADATA_PATTERNS = [
  'raw',
  'normalizedtext',
  'content',
  'prompt',
  'token',
  'secret',
  'password',
  'storage',
  'filename',
  'filepath',
  'path',
  'useragent',
  'ipaddress',
  'email',
  'phone',
  'fullname',
  'candidate',
  'address',
  'stack',
  'body',
];

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

function formatAction(value?: string | null) {
  if (!value) return '-';
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function actorLabel(log: ApplicationAuditLogRecord) {
  const actorType = log.actorType ?? 'UNKNOWN';
  return log.actorId ? `${actorType} - ${log.actorId}` : actorType;
}

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return BLOCKED_METADATA_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function safeMetadataEntries(metadata?: Record<string, unknown> | null) {
  if (!metadata) return [];

  return Object.entries(metadata)
    .filter(([key, value]) => {
      if (isSensitiveKey(key)) return false;
      return (
        typeof value === 'string'
        || typeof value === 'number'
        || typeof value === 'boolean'
      );
    })
    .slice(0, 6)
    .map(([key, value]) => {
      const rawValue = String(value);
      return {
        key,
        value: rawValue.length > 80 ? `${rawValue.slice(0, 77)}...` : rawValue,
      };
    });
}

function objectLabel(log: ApplicationAuditLogRecord) {
  const type = valueOrDash(log.objectType);
  if (!log.objectId) return type;
  return `${type} - ${log.objectId}`;
}

export function ApplicationAuditLog({
  logs,
  pagination,
  loading = false,
  error,
  onRefresh,
}: ApplicationAuditLogProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg">Audit Log</CardTitle>
            {pagination && (
              <p className="mt-1 text-sm text-muted-foreground">
                Showing {logs.length} of {pagination.total} records.
              </p>
            )}
          </div>
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
            Loading audit logs...
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Object</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Safe metadata</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                  No audit records found.
                </TableCell>
              </TableRow>
            )}

            {logs.map((log) => {
              const metadata = safeMetadataEntries(log.metadata);

              return (
                <TableRow key={log.auditLogId ?? log.id ?? `${log.action}-${log.createdAt}`}>
                  <TableCell className="font-medium">{formatAction(log.action)}</TableCell>
                  <TableCell className="max-w-[220px] break-words">
                    {actorLabel(log)}
                  </TableCell>
                  <TableCell className="max-w-[240px] break-words">
                    {objectLabel(log)}
                  </TableCell>
                  <TableCell className="max-w-[260px] break-words">
                    {valueOrDash(log.reason)}
                  </TableCell>
                  <TableCell>
                    {metadata.length === 0 ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      <div className="flex max-w-[360px] flex-wrap gap-2">
                        {metadata.map((entry) => (
                          <Badge key={entry.key} variant="outline">
                            {entry.key}: {entry.value}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(log.createdAt)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
