import { AlertCircle, CheckCircle2, Circle, RefreshCw } from 'lucide-react';
import {
  getApplicationStatusClassName,
  getApplicationStatusLabel,
} from '@/components/recruitment/ApplicationOverview';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { ApplicationTimelineRecord } from '@/lib/recruitment-api';
import { cn } from '@/lib/utils';

interface WorkflowTimelineProps {
  events: ApplicationTimelineRecord[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
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

function formatEventType(value?: string | null) {
  if (!value) return 'Unknown event';
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function isProblemEvent(event: ApplicationTimelineRecord) {
  const haystack = `${event.eventType} ${event.status ?? ''}`.toUpperCase();
  return haystack.includes('FAILED')
    || haystack.includes('REJECTED')
    || haystack.includes('MALWARE');
}

function isSuccessEvent(event: ApplicationTimelineRecord) {
  const haystack = `${event.eventType} ${event.status ?? ''}`.toUpperCase();
  return haystack.includes('PASSED')
    || haystack.includes('SANITIZED')
    || haystack.includes('PARSED')
    || haystack.includes('DONE')
    || haystack.includes('APPROVED');
}

function EventIcon({ event }: { event: ApplicationTimelineRecord }) {
  if (isProblemEvent(event)) {
    return <AlertCircle className="h-4 w-4 text-red-600" />;
  }

  if (isSuccessEvent(event)) {
    return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  }

  return <Circle className="h-4 w-4 text-blue-600" />;
}

function actorLabel(event: ApplicationTimelineRecord) {
  const actorType = event.actorType ?? 'UNKNOWN';
  return event.actorId ? `${actorType} - ${event.actorId}` : actorType;
}

export function WorkflowTimeline({
  events,
  loading = false,
  error,
  onRefresh,
}: WorkflowTimelineProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg">Workflow Timeline</CardTitle>
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
            Loading workflow timeline...
          </div>
        )}

        {!loading && events.length === 0 && (
          <div className="rounded-md border p-4 text-sm text-muted-foreground">
            No workflow events found.
          </div>
        )}

        <div className="space-y-0">
          {events.map((event, index) => (
            <div
              key={event.id ?? `${event.eventType}-${event.createdAt}-${index}`}
              className="relative flex gap-4 pb-6 last:pb-0"
            >
              {index < events.length - 1 && (
                <div className="absolute left-[11px] top-7 h-[calc(100%-1.75rem)] w-px bg-border" />
              )}
              <div className="relative z-10 mt-1 flex h-6 w-6 items-center justify-center rounded-full border bg-background">
                <EventIcon event={event} />
              </div>
              <div className="min-w-0 flex-1 rounded-md border p-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{formatEventType(event.eventType)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {event.message || formatEventType(event.eventType)}
                    </p>
                  </div>
                  {event.status && (
                    <Badge className={cn('w-fit', getApplicationStatusClassName(event.status))}>
                      {getApplicationStatusLabel(event.status)}
                    </Badge>
                  )}
                </div>

                <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                  <div>
                    <span className="text-muted-foreground">Actor</span>
                    <p className="mt-1 break-words font-medium">{actorLabel(event)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">From status</span>
                    <p className="mt-1 break-words font-medium">
                      {event.fromStatus ? getApplicationStatusLabel(event.fromStatus) : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created</span>
                    <p className="mt-1 break-words font-medium">
                      {formatDate(event.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
