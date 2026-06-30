import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  Edit,
  ExternalLink,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { JobPostingForm } from '@/components/recruitment/JobPostingForm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { getInternalSafeErrorMessage } from '@/lib/api-errors';
import {
  closeJobPosting,
  getJobPosting,
  listJobPostingChannels,
  publishJobPosting,
  updateJobPosting,
  type JobPostingChannelStatus,
  type JobPostingPayload,
  type JobPostingRecord,
} from '@/lib/recruitment-api';
import { cn } from '@/lib/utils';

const CHANNEL_OPTIONS = [
  { value: 'VCS_PORTAL', label: 'VCS Portal' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'LINKEDIN', label: 'LinkedIn' },
  { value: 'TOPCV', label: 'TopCV' },
  { value: 'VIETNAMWORKS', label: 'VietnamWorks' },
];

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PUBLISHING: 'Publishing',
  PUBLISHED: 'Published',
  PUBLISH_FAILED: 'Publish failed',
  MANUAL_REQUIRED: 'Manual required',
  CLOSED: 'Closed',
  ARCHIVED: 'Archived',
};

function newIdempotencyKey(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getJobPostingId(item?: JobPostingRecord | null) {
  return item?.id ?? item?.jobPostingId ?? '';
}

function getStatusLabel(status?: string | null) {
  if (!status) return 'Unknown';
  return STATUS_LABELS[status] ?? status;
}

function getStatusClassName(status?: string | null) {
  switch (status) {
    case 'PUBLISHED':
      return 'bg-green-100 text-green-800';
    case 'PUBLISHING':
      return 'bg-blue-100 text-blue-800';
    case 'DRAFT':
      return 'bg-slate-100 text-slate-700';
    case 'MANUAL_REQUIRED':
      return 'bg-amber-100 text-amber-800';
    case 'PUBLISH_FAILED':
      return 'bg-red-100 text-red-800';
    case 'CLOSED':
    case 'ARCHIVED':
      return 'bg-zinc-100 text-zinc-700';
    default:
      return 'bg-secondary text-secondary-foreground';
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

function relatedJobTitle(item?: JobPostingRecord | null) {
  return item?.jobDescription?.title
    ?? item?.jobDescriptionVersion?.jobDescription?.title
    ?? item?.jobDescriptionId
    ?? '-';
}

function versionLabel(item?: JobPostingRecord | null) {
  const versionNo = item?.jobDescriptionVersion?.versionNo;
  if (versionNo) return `v${versionNo} (${item?.jobDescriptionVersionId ?? '-'})`;
  return item?.jobDescriptionVersionId ?? '-';
}

function channelLabel(channel?: string) {
  return CHANNEL_OPTIONS.find((option) => option.value === channel)?.label ?? channel ?? '-';
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

export function JobPostingDetailPage() {
  const { id } = useParams();
  const [jobPosting, setJobPosting] = useState<JobPostingRecord | null>(null);
  const [channels, setChannels] = useState<JobPostingChannelStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['VCS_PORTAL']);
  const [publishNote, setPublishNote] = useState('');
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishInfo, setPublishInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);

  const loadChannels = useCallback(async () => {
    if (!id) return;
    setChannelsLoading(true);
    setChannelsError(null);

    try {
      const data = await listJobPostingChannels(id);
      setChannels(data);
    } catch (err) {
      setChannels([]);
      setChannelsError(getInternalSafeErrorMessage(err));
    } finally {
      setChannelsLoading(false);
    }
  }, [id]);

  const loadDetail = useCallback(async () => {
    if (!id) {
      setError('Job posting id is missing.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getJobPosting(id);
      setJobPosting(data);
    } catch (err) {
      setJobPosting(null);
      setError(getInternalSafeErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  const reload = useCallback(async () => {
    await loadDetail();
    await loadChannels();
  }, [loadDetail, loadChannels]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleUpdate = async (payload: JobPostingPayload) => {
    if (!id) return;
    setSubmitting(true);

    try {
      const updatePayload = {
        title: payload.title,
        publicSlug: payload.publicSlug,
        openAt: payload.openAt,
        closeAt: payload.closeAt,
      };
      await updateJobPosting(id, updatePayload, newIdempotencyKey('posting-update'));
      toast({ title: 'Job posting updated' });
      setEditOpen(false);
      await reload();
    } catch (err) {
      toast({
        title: 'Update failed',
        description: getInternalSafeErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePublish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id) return;

    if (selectedChannels.length === 0) {
      setPublishError('Select at least one publish channel.');
      return;
    }

    setSubmitting(true);
    setPublishError(null);
    setPublishInfo(
      selectedChannels.includes('FACEBOOK')
        ? 'Facebook login browser will open automatically if the session needs renewal. Publishing continues after login is detected.'
        : null,
    );

    try {
      await publishJobPosting(
        id,
        {
          publishChannels: selectedChannels,
          publishNote: publishNote.trim() || undefined,
        },
        newIdempotencyKey('posting-publish'),
      );
      toast({ title: 'Job posting publish requested' });
      setPublishOpen(false);
      setPublishNote('');
      setPublishInfo(null);
      await reload();
    } catch (err) {
      setPublishInfo(null);
      toast({
        title: 'Publish failed',
        description: getInternalSafeErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async () => {
    if (!id) return;
    const confirmed = window.confirm('Close this job posting? Candidates will no longer apply.');
    if (!confirmed) return;

    setClosing(true);
    try {
      await closeJobPosting(id, newIdempotencyKey('posting-close'));
      toast({ title: 'Job posting closed' });
      await reload();
    } catch (err) {
      toast({
        title: 'Close failed',
        description: getInternalSafeErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setClosing(false);
    }
  };

  const toggleChannel = (channel: string) => {
    setSelectedChannels((current) => (
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel]
    ));
  };

  const status = jobPosting?.status;
  const closedLike = status === 'CLOSED' || status === 'ARCHIVED';
  const publishedLike = status === 'PUBLISHED';
  const publicSlug = jobPosting?.publicSlug ?? '';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link to="/recruitment/job-postings">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to list
            </Link>
          </Button>
          <div>
            <p className="text-sm text-muted-foreground">Recruitment workspace</p>
            <h1 className="text-2xl font-semibold">
              {jobPosting?.title ?? 'Job Posting Detail'}
            </h1>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {publicSlug && (
            <Button asChild variant="outline">
              <Link to={`/jobs/${publicSlug}`}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Public preview
              </Link>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => void reload()}
            disabled={loading || channelsLoading}
          >
            <RefreshCw
              className={cn('mr-2 h-4 w-4', (loading || channelsLoading) && 'animate-spin')}
            />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditOpen(true)}
            disabled={!jobPosting || loading || closedLike}
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button
            type="button"
            onClick={() => setPublishOpen(true)}
            disabled={!jobPosting || loading || closedLike || publishedLike}
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            Publish
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleClose()}
            disabled={!jobPosting || closedLike || closing}
          >
            <XCircle className="mr-2 h-4 w-4" />
            {closing ? 'Closing...' : 'Close'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">
          Loading job posting...
        </div>
      )}

      {!loading && jobPosting && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-lg">Overview</CardTitle>
              <Badge className={getStatusClassName(status)}>
                {getStatusLabel(status)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DetailField label="Public slug" value={jobPosting.publicSlug ?? '-'} />
              <DetailField label="Linked JD" value={relatedJobTitle(jobPosting)} />
              <DetailField label="JD version" value={versionLabel(jobPosting)} />
              <DetailField label="Posting ID" value={getJobPostingId(jobPosting) || '-'} />
            </div>
            <Separator />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DetailField label="Open at" value={formatDate(jobPosting.openAt)} />
              <DetailField label="Close at" value={formatDate(jobPosting.closeAt)} />
              <DetailField label="Created" value={formatDate(jobPosting.createdAt)} />
              <DetailField label="Updated" value={formatDate(jobPosting.updatedAt)} />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg">Channel Status</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadChannels()}
              disabled={channelsLoading || !id}
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', channelsLoading && 'animate-spin')} />
              Refresh channels
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {channelsError && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {channelsError}
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Published URL</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channelsLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                    Loading channel status...
                  </TableCell>
                </TableRow>
              )}

              {!channelsLoading && channels.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                    No channel status found.
                  </TableCell>
                </TableRow>
              )}

              {!channelsLoading && channels.map((channel) => (
                <TableRow key={`${channel.channel}-${channel.publishedUrl ?? channel.updatedAt ?? ''}`}>
                  <TableCell className="font-medium">{channelLabel(channel.channel)}</TableCell>
                  <TableCell>
                    <Badge className={getStatusClassName(channel.status)}>
                      {getStatusLabel(channel.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {channel.publishedUrl ? (
                      <a
                        href={channel.publishedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        Open
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : channel.manualInstruction ? (
                      channel.manualInstruction
                    ) : '-'}
                  </TableCell>
                  <TableCell>{formatDate(channel.updatedAt ?? channel.publishedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Job Posting</DialogTitle>
            <DialogDescription>
              Update posting title, public slug and publish window before closing.
            </DialogDescription>
          </DialogHeader>
          <JobPostingForm
            mode="edit"
            initialValue={jobPosting}
            submitting={submitting}
            onCancel={() => setEditOpen(false)}
            onSubmit={handleUpdate}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={publishOpen}
        onOpenChange={(open) => {
          setPublishOpen(open);
          if (!open) {
            setPublishError(null);
            setPublishInfo(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish Job Posting</DialogTitle>
            <DialogDescription>
              Publish this posting to selected channels. Public preview uses the posting slug.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePublish} className="space-y-5">
            <div className="space-y-3">
              <Label>Publish channels</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {CHANNEL_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 rounded-md border p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedChannels.includes(option.value)}
                      onChange={() => toggleChannel(option.value)}
                      disabled={submitting}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              {publishError && <p className="text-sm text-destructive">{publishError}</p>}
              {publishInfo && <p className="text-sm text-muted-foreground">{publishInfo}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="publish-note">Publish note</Label>
              <Textarea
                id="publish-note"
                value={publishNote}
                onChange={(event) => setPublishNote(event.target.value)}
                rows={4}
                disabled={submitting}
              />
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPublishOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                <CheckCircle className="mr-2 h-4 w-4" />
                {submitting && selectedChannels.includes('FACEBOOK')
                  ? 'Publishing / waiting for Facebook...'
                  : submitting
                    ? 'Publishing...'
                    : 'Publish'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
