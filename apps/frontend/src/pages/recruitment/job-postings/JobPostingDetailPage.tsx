import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  ChevronUp,
  Edit,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
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
import { Input } from '@/components/ui/input';
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
import { ensureFacebookBrowserSession, startFacebookExtensionPublish } from '@/lib/facebook-extension-bridge';
import {
  closeJobPosting,
  createFacebookGroup,
  deleteFacebookGroup,
  getJobPosting,
  listJobPostingChannels,
  listFacebookGroups,
  publishJobPosting,
  updateFacebookGroup,
  updateJobPosting,
  type FacebookPublishTarget,
  type JobPostingChannelStatus,
  type JobPostingPayload,
  type JobPostingRecord,
} from '@/lib/recruitment-api';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const CHANNEL_OPTIONS = [
  { value: 'VCS_PORTAL', label: 'VCS Portal' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'LINKEDIN', label: 'LinkedIn' },
  { value: 'TOPCV', label: 'TopCV' },
  { value: 'VIETNAMWORKS', label: 'VietnamWorks' },
];

type FacebookGroupLoadState =
  | 'IDLE'
  | 'CHECKING_LOGIN'
  | 'LOADING_GROUPS'
  | 'READY'
  | 'ERROR';

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

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function selectedCountAfterRefresh(
  groups: FacebookPublishTarget[],
  currentSelection: string[],
  selectAllWhenEmpty?: boolean,
) {
  const activeIds = groups.map((group) => group.targetId).filter(isString);
  const retained = currentSelection.filter((targetId) => activeIds.includes(targetId));
  if (retained.length > 0) return retained.length;
  return selectAllWhenEmpty ? activeIds.length : 0;
}

function isFacebookBusy(state: FacebookGroupLoadState) {
  return state === 'CHECKING_LOGIN' || state === 'LOADING_GROUPS';
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
  const [facebookGroups, setFacebookGroups] = useState<FacebookPublishTarget[]>([]);
  const [selectedFacebookGroupIds, setSelectedFacebookGroupIds] = useState<string[]>([]);
  const [facebookGroupLoadState, setFacebookGroupLoadState] = useState<FacebookGroupLoadState>('IDLE');
  const [facebookGroupMessage, setFacebookGroupMessage] = useState<string | null>(null);
  const [facebookSettingsOpen, setFacebookSettingsOpen] = useState(false);
  const [facebookGroupName, setFacebookGroupName] = useState('');
  const [facebookGroupUrl, setFacebookGroupUrl] = useState('');
  const [editingFacebookGroup, setEditingFacebookGroup] = useState<FacebookPublishTarget | null>(null);
  const [facebookGroupSaving, setFacebookGroupSaving] = useState(false);
  const [facebookPublishStatus, setFacebookPublishStatus] = useState<string | null>(null);
  const [publishNote, setPublishNote] = useState('');
  const [publishError, setPublishError] = useState<string | null>(null);
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
    if (selectedChannels.includes('FACEBOOK') && selectedFacebookGroupIds.length === 0) {
      setPublishError('Select at least one Facebook group before publishing.');
      return;
    }

    setSubmitting(true);
    setPublishError(null);
    setFacebookPublishStatus(null);

    try {
      const response = await publishJobPosting(
        id,
        {
          publishChannels: selectedChannels,
          publishNote: publishNote.trim() || undefined,
          ...(selectedChannels.includes('FACEBOOK') ? { facebookTargetIds: selectedFacebookGroupIds } : {}),
        },
        newIdempotencyKey('posting-publish'),
      );
      if (response.facebookPublishPlan && selectedChannels.includes('FACEBOOK')) {
        const accessToken = apiClient.getToken() ?? localStorage.getItem('token');
        if (!accessToken) {
          throw new Error('Authentication token is required for browser Facebook publishing.');
        }

        await startFacebookExtensionPublish(accessToken, response.facebookPublishPlan, {
          onProgress: (progress) => {
            setFacebookPublishStatus(progress.message);
          },
        });
        toast({ title: 'Facebook publishing completed in this browser' });
      }
      toast({ title: 'Job posting publish requested' });
      setPublishOpen(false);
      setPublishNote('');
      await reload();
    } catch (err) {
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
    if (channel === 'FACEBOOK') {
      void toggleFacebookChannel();
      return;
    }

    setSelectedChannels((current) => (
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel]
    ));
  };

  const toggleFacebookChannel = async () => {
    if (selectedChannels.includes('FACEBOOK')) {
      setSelectedChannels((current) => current.filter((item) => item !== 'FACEBOOK'));
      setFacebookGroupLoadState('IDLE');
      setFacebookGroupMessage(null);
      setFacebookPublishStatus(null);
      return;
    }

    setSelectedChannels((current) => [...current, 'FACEBOOK']);
    setFacebookGroupLoadState('CHECKING_LOGIN');
    setFacebookGroupMessage('Checking Facebook login in this browser.');
    setPublishError(null);

    try {
      await ensureFacebookBrowserSession();
      await refreshFacebookGroups({ selectAllWhenEmpty: true });
    } catch (err) {
      setSelectedChannels((current) => current.filter((item) => item !== 'FACEBOOK'));
      setFacebookGroupLoadState('ERROR');
      setFacebookGroupMessage(getInternalSafeErrorMessage(err));
      setPublishError(getInternalSafeErrorMessage(err));
    }
  };

  const refreshFacebookGroups = async (
    options: { selectAllWhenEmpty?: boolean } = {},
  ) => {
    setFacebookGroupLoadState('LOADING_GROUPS');
    setFacebookGroupMessage('Loading allowed Facebook groups from backend.');

    try {
      const groups = await listFacebookGroups();
      setFacebookGroups(groups);
      setSelectedFacebookGroupIds((current) => {
        const activeIds = groups.map((group) => group.targetId).filter(isString);
        const retained = current.filter((targetId) => activeIds.includes(targetId));
        if (retained.length > 0) return retained;
        return options.selectAllWhenEmpty ? activeIds : [];
      });
      setFacebookGroupLoadState('READY');
      setFacebookGroupMessage(
        groups.length > 0
          ? `${selectedCountAfterRefresh(groups, selectedFacebookGroupIds, options.selectAllWhenEmpty)}/${groups.length} allowed Facebook group(s) selected.`
          : 'No Facebook groups are configured for this account yet.',
      );
    } catch (err) {
      const message = getInternalSafeErrorMessage(err);
      setFacebookGroupLoadState('ERROR');
      setFacebookGroupMessage(message);
      throw err;
    }
  };

  const toggleFacebookGroupSelection = (targetId?: string | null) => {
    if (!targetId) return;

    setSelectedFacebookGroupIds((current) => (
      current.includes(targetId)
        ? current.filter((item) => item !== targetId)
        : [...current, targetId]
    ));
  };

  const submitFacebookGroup = async () => {
    const targetName = facebookGroupName.trim();
    const targetUrl = facebookGroupUrl.trim();
    if (!targetName || !targetUrl) {
      setPublishError('Facebook group name and URL are required.');
      return;
    }

    setFacebookGroupSaving(true);
    setPublishError(null);
    try {
      if (editingFacebookGroup?.targetId) {
        await updateFacebookGroup(editingFacebookGroup.targetId, { targetName, targetUrl });
      } else {
        const savedGroup = await createFacebookGroup({ targetName, targetUrl });
        if (savedGroup.targetId) {
          setSelectedFacebookGroupIds((current) => [...new Set([...current, savedGroup.targetId as string])]);
        }
      }
      setFacebookGroupName('');
      setFacebookGroupUrl('');
      setEditingFacebookGroup(null);
      await refreshFacebookGroups();
    } catch (err) {
      setPublishError(getInternalSafeErrorMessage(err));
    } finally {
      setFacebookGroupSaving(false);
    }
  };

  const startEditFacebookGroup = (group: FacebookPublishTarget) => {
    setEditingFacebookGroup(group);
    setFacebookGroupName(group.targetName);
    setFacebookGroupUrl(group.targetUrl ?? '');
    setFacebookSettingsOpen(true);
  };

  const removeFacebookGroup = async (group: FacebookPublishTarget) => {
    if (!group.targetId) return;
    const confirmed = window.confirm(`Remove Facebook group "${group.targetName}"?`);
    if (!confirmed) return;

    setFacebookGroupSaving(true);
    setPublishError(null);
    try {
      await deleteFacebookGroup(group.targetId);
      setSelectedFacebookGroupIds((current) => current.filter((targetId) => targetId !== group.targetId));
      await refreshFacebookGroups();
    } catch (err) {
      setPublishError(getInternalSafeErrorMessage(err));
    } finally {
      setFacebookGroupSaving(false);
    }
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
          if (!open) setPublishError(null);
        }}
      >
        <DialogContent className="max-w-2xl">
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
                    className={cn(
                      'flex items-center gap-2 rounded-md border p-3 text-sm',
                      option.value === 'FACEBOOK' && selectedChannels.includes('FACEBOOK') && 'border-emerald-400 bg-emerald-50',
                    )}
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
              {selectedChannels.includes('FACEBOOK') ? (
                <section className="rounded-md border border-emerald-400 bg-emerald-50">
                  <div className="flex items-center justify-between gap-3 border-b border-emerald-200 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                      <span>Facebook groups</span>
                      {isFacebookBusy(facebookGroupLoadState) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-emerald-900 hover:bg-emerald-100"
                        disabled={submitting || isFacebookBusy(facebookGroupLoadState)}
                        onClick={() => {
                          void refreshFacebookGroups().catch((err) => {
                            setPublishError(getInternalSafeErrorMessage(err));
                          });
                        }}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-emerald-900 hover:bg-emerald-100"
                        disabled={submitting}
                        onClick={() => setFacebookSettingsOpen((open) => !open)}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      <ChevronUp className="h-4 w-4 text-emerald-800" />
                    </div>
                  </div>

                  <div className="space-y-2 p-3">
                    <p className="text-xs text-emerald-900">
                      {isFacebookBusy(facebookGroupLoadState) && facebookGroupMessage
                        ? facebookGroupMessage
                        : `${selectedFacebookGroupIds.length}/${facebookGroups.length} allowed Facebook group(s) selected.`}
                    </p>

                    {facebookGroups.length > 0 ? (
                      <div className="divide-y divide-emerald-100 rounded-md bg-white">
                        {facebookGroups.map((group) => (
                          <div
                            key={group.targetId ?? group.targetUrl ?? group.targetName}
                            className="flex items-center justify-between gap-3 px-3 py-2"
                          >
                            <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={Boolean(group.targetId && selectedFacebookGroupIds.includes(group.targetId))}
                                disabled={submitting || !group.targetId}
                                onChange={() => toggleFacebookGroupSelection(group.targetId)}
                              />
                              <span className="truncate">{group.targetName}</span>
                            </label>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                disabled={submitting}
                                onClick={() => startEditFacebookGroup(group)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                disabled={submitting || facebookGroupSaving}
                                onClick={() => void removeFacebookGroup(group)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-emerald-300 bg-white p-3 text-sm text-muted-foreground">
                        No Facebook groups are configured for this account yet.
                      </div>
                    )}

                    {facebookSettingsOpen ? (
                      <div className="space-y-3 rounded-md border border-emerald-200 bg-white p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">
                            {editingFacebookGroup ? 'Edit Facebook group' : 'Add Facebook group'}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => {
                              setEditingFacebookGroup(null);
                              setFacebookGroupName('');
                              setFacebookGroupUrl('');
                            }}
                          >
                            <Plus className="mr-1 h-4 w-4" />
                            New
                          </Button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="facebook-group-name">Group name</Label>
                            <Input
                              id="facebook-group-name"
                              value={facebookGroupName}
                              disabled={facebookGroupSaving}
                              placeholder="Hoi Nhom FullStack Ha Noi"
                              onChange={(event) => setFacebookGroupName(event.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="facebook-group-url">Group URL</Label>
                            <Input
                              id="facebook-group-url"
                              value={facebookGroupUrl}
                              disabled={facebookGroupSaving}
                              placeholder="https://www.facebook.com/groups/..."
                              onChange={(event) => setFacebookGroupUrl(event.target.value)}
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            disabled={facebookGroupSaving}
                            onClick={() => void submitFacebookGroup()}
                          >
                            {facebookGroupSaving ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Plus className="mr-2 h-4 w-4" />
                            )}
                            {editingFacebookGroup ? 'Save group' : 'Add group'}
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {facebookPublishStatus ? (
                      <p className="rounded-md bg-white p-2 text-xs text-emerald-900">
                        {facebookPublishStatus}
                      </p>
                    ) : null}
                  </div>
                </section>
              ) : null}
              {publishError && <p className="text-sm text-destructive">{publishError}</p>}
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
                {submitting ? 'Publishing...' : 'Publish'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
