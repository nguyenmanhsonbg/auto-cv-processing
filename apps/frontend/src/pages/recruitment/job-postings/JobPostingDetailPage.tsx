import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  ChevronUp,
  Edit,
  ExternalLink,
  ImagePlus,
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
import {
  ensureFacebookBrowserSession,
  startFacebookExtensionPublish,
  verifyFacebookGroupInBrowser,
} from '@/lib/facebook-extension-bridge';
import {
  closeJobPosting,
  createFacebookGroup,
  deleteFacebookGroup,
  getJobPosting,
  listJobPostingChannels,
  listFacebookGroups,
  publishJobPosting,
  reportFacebookPublishResult,
  updateFacebookGroup,
  updateJobPosting,
  verifyFacebookGroup,
  type FacebookImageAttachFailureContext,
  type FacebookImageAttachFailureDecision,
  type FacebookPublishAttachment,
  type FacebookPublishPlan,
  type FacebookPublishResultPayload,
  type FacebookPublishTarget,
  type FacebookPublishTargetEligibilityStatus,
  type JobPostingChannelStatus,
  type JobPostingPayload,
  type JobPostingRecord,
} from '@/lib/recruitment-api';
import { ApiError, apiClient } from '@/lib/api-client';
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
  | 'VERIFYING'
  | 'READY'
  | 'ERROR';
type FacebookImageAttachmentState = 'IDLE' | 'READING' | 'READY' | 'ERROR';

const FACEBOOK_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
const FACEBOOK_IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const FACEBOOK_IMAGE_ALLOWED_TYPES = new Set(FACEBOOK_IMAGE_ACCEPT.split(','));

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

function getFacebookResultKey(result: FacebookPublishResultPayload) {
  return result.targetId
    ?? result.targetUrl
    ?? `${result.targetType}:${result.targetName}`;
}

function getFacebookTargetKey(target: FacebookPublishPlan['targets'][number]) {
  return target.targetId
    ?? target.targetUrl
    ?? `${target.targetType}:${target.targetName}`;
}

async function reportUnreportedFacebookPublishFailures(
  plan: FacebookPublishPlan,
  reportedResults: FacebookPublishResultPayload[],
  error: unknown,
) {
  const reportedKeys = new Set(reportedResults.map(getFacebookResultKey));
  const unreportedTargets = plan.targets.filter((target) => !reportedKeys.has(getFacebookTargetKey(target)));
  if (unreportedTargets.length === 0) return;

  const message = `Facebook browser publishing failed before this target was reported: ${getInternalSafeErrorMessage(error)}`;
  const normalizedMessage = message.length > 4000 ? `${message.slice(0, 3997)}...` : message;

  await Promise.allSettled(unreportedTargets.map((target) => reportFacebookPublishResult({
    jobPostingId: plan.jobPostingId,
    targetId: target.targetId ?? null,
    targetType: target.targetType,
    targetName: target.targetName,
    targetUrl: target.targetUrl ?? null,
    content: plan.content,
    status: 'FAILED',
    facebookReviewStatus: 'UNKNOWN',
    message: normalizedMessage,
    externalPostId: null,
    externalPostUrl: null,
    submittedAt: null,
  })));
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

function isDuplicateFacebookGroupError(error: unknown) {
  return error instanceof ApiError && error.code === 'FACEBOOK_GROUP_ALREADY_EXISTS';
}

function getFacebookGroupUrlValidationError(
  value: string,
  groups: FacebookPublishTarget[],
  currentTargetId?: string | null,
) {
  if (!isFacebookGroupUrlCandidate(value)) {
    return 'Link URL phải có dạng https://www.facebook.com/groups/{groupId}.';
  }

  return getDuplicateFacebookGroupUrlError(value, groups, currentTargetId);
}

function getDuplicateFacebookGroupUrlError(
  value: string,
  groups: FacebookPublishTarget[],
  currentTargetId?: string | null,
) {
  const externalId = readFacebookGroupExternalId(value);
  if (!externalId) return null;

  const existingGroup = groups.find((group) => (
    normalizeFacebookGroupExternalId(group.targetExternalId) === externalId
    && group.targetId !== currentTargetId
  ));

  return existingGroup ? 'Group đã tồn tại.' : null;
}

function isFacebookGroupUrlCandidate(value: string) {
  return Boolean(readFacebookGroupExternalId(value));
}

function readFacebookGroupExternalId(value: string) {
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    const isFacebookHost = hostname === 'facebook.com' || hostname.endsWith('.facebook.com');
    if (!isFacebookHost) return null;

    const pathSegments = url.pathname.split('/').filter(Boolean);
    const groupsIndex = pathSegments.findIndex((segment) => segment.toLowerCase() === 'groups');
    const rawExternalId = groupsIndex >= 0 ? pathSegments[groupsIndex + 1] : undefined;
    return normalizeFacebookGroupExternalId(rawExternalId);
  } catch {
    return null;
  }
}

function normalizeFacebookGroupExternalId(value: string | null | undefined) {
  if (!value) return null;

  try {
    return decodeURIComponent(value).trim().toLowerCase() || null;
  } catch {
    return value.trim().toLowerCase() || null;
  }
}

function selectedCountAfterRefresh(
  groups: FacebookPublishTarget[],
  currentSelection: string[],
  selectAllWhenEmpty?: boolean,
) {
  const selectableIds = groups.filter(isSelectableFacebookGroup).map((group) => group.targetId).filter(isString);
  const retained = currentSelection.filter((targetId) => selectableIds.includes(targetId));
  if (retained.length > 0) return retained.length;
  return selectAllWhenEmpty ? selectableIds.length : 0;
}

function replaceFacebookGroup(groups: FacebookPublishTarget[], updatedGroup: FacebookPublishTarget) {
  const updatedId = updatedGroup.targetId;
  const index = updatedId ? groups.findIndex((group) => group.targetId === updatedId) : -1;
  if (index < 0) return [...groups, updatedGroup];

  return groups.map((group, groupIndex) => (groupIndex === index ? updatedGroup : group));
}

function isFacebookBusy(state: FacebookGroupLoadState) {
  return state === 'CHECKING_LOGIN' || state === 'LOADING_GROUPS';
}

function isSelectableFacebookGroup(group: FacebookPublishTarget) {
  return Boolean(
    group.targetId
      && group.selectable
      && group.eligibilityStatus === 'CAN_POST'
      && !group.quotaExceeded,
  );
}

function countSelectableFacebookGroups(groups: FacebookPublishTarget[]) {
  return groups.filter(isSelectableFacebookGroup).length;
}

function getFacebookEligibilityLabel(status?: FacebookPublishTargetEligibilityStatus | null) {
  if (status === 'CAN_POST') return 'Can post';
  if (status === 'CANNOT_POST') return 'Cannot post';
  return 'Needs check';
}

function getFacebookEligibilityClass(status?: FacebookPublishTargetEligibilityStatus | null) {
  if (status === 'CAN_POST') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'CANNOT_POST') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function getFacebookGroupDisabledReason(group: FacebookPublishTarget) {
  if (!group.targetId) return 'Facebook group id is missing.';
  if (group.quotaExceeded) return group.disabledReason || 'Daily publish limit has been reached for this group.';
  if (group.eligibilityStatus === 'UNKNOWN') {
    const reason = group.disabledReason || group.eligibilityReason || '';
    if (isAmbiguousFacebookComposerVerificationReason(reason)) {
      return 'Check this group again with the current Facebook browser session.';
    }

    return reason || 'Check this group before publishing.';
  }
  if (group.eligibilityStatus === 'CANNOT_POST') {
    return group.disabledReason || group.eligibilityReason || 'Current Facebook account cannot post to this group.';
  }
  return group.disabledReason ?? null;
}

function getFacebookGroupVerificationMessage(group: FacebookPublishTarget) {
  const reason = getFacebookGroupDisabledReason(group);
  if (group.eligibilityStatus === 'UNKNOWN') {
    return `"${group.targetName}" needs another check before publishing: ${reason}`;
  }

  return `"${group.targetName}" cannot be used: ${reason}`;
}

function isAmbiguousFacebookComposerVerificationReason(reason: string) {
  const normalizedReason = reason.toLowerCase();
  return normalizedReason.includes('composermatches=')
    || normalizedReason.includes('hidden and visible verification could not prove posting eligibility')
    || normalizedReason.includes('could not open facebook group post composer automatically')
    || normalizedReason.includes('could not verify facebook group composer automatically');
}

function getFacebookImageFileValidationError(file: File) {
  if (!FACEBOOK_IMAGE_ALLOWED_TYPES.has(file.type)) {
    return 'Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.';
  }

  if (file.size > FACEBOOK_IMAGE_MAX_SIZE_BYTES) {
    return `Ảnh phải nhỏ hơn ${formatFileSize(FACEBOOK_IMAGE_MAX_SIZE_BYTES)}.`;
  }

  return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Could not read image file.'));
    };
    reader.onerror = () => reject(new Error(reader.error?.message ?? 'Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.ceil(size / 1024)} KB`;
  }

  return `${size} B`;
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
  const [facebookImageAttachment, setFacebookImageAttachment] = useState<FacebookPublishAttachment | null>(null);
  const [facebookImageAttachmentState, setFacebookImageAttachmentState] = useState<FacebookImageAttachmentState>('IDLE');
  const [facebookImageAttachmentError, setFacebookImageAttachmentError] = useState<string | null>(null);
  const [facebookImageAttachPrompt, setFacebookImageAttachPrompt] = useState<FacebookImageAttachFailureContext | null>(null);
  const [verifyingFacebookGroupIds, setVerifyingFacebookGroupIds] = useState<string[]>([]);
  const [queuedFacebookGroupIds, setQueuedFacebookGroupIds] = useState<string[]>([]);
  const [facebookSettingsOpen, setFacebookSettingsOpen] = useState(false);
  const [facebookGroupName, setFacebookGroupName] = useState('');
  const [facebookGroupUrl, setFacebookGroupUrl] = useState('');
  const [facebookGroupUrlError, setFacebookGroupUrlError] = useState<string | null>(null);
  const [editingFacebookGroup, setEditingFacebookGroup] = useState<FacebookPublishTarget | null>(null);
  const [facebookGroupSaving, setFacebookGroupSaving] = useState(false);
  const [facebookPublishStatus, setFacebookPublishStatus] = useState<string | null>(null);
  const [publishNote, setPublishNote] = useState('');
  const [publishError, setPublishError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);
  const facebookGroupsRef = useRef<FacebookPublishTarget[]>(facebookGroups);
  const facebookImageInputRef = useRef<HTMLInputElement | null>(null);
  const facebookImageReadSeqRef = useRef(0);
  const facebookImageAttachPromptResolverRef = useRef<((decision: FacebookImageAttachFailureDecision) => void) | null>(null);
  const facebookGroupVerificationQueueRef = useRef<FacebookPublishTarget[]>([]);
  const facebookGroupVerificationRunningRef = useRef(false);
  const activeFacebookGroupVerificationIdRef = useRef<string | null>(null);

  useEffect(() => {
    facebookGroupsRef.current = facebookGroups;
  }, [facebookGroups]);

  useEffect(() => () => {
    facebookImageAttachPromptResolverRef.current?.('SKIP');
    facebookImageAttachPromptResolverRef.current = null;
  }, []);

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
    if (isFacebookImageReading) {
      setPublishError('Vui lòng chờ ảnh upload được xử lý xong trước khi đăng bài.');
      return;
    }
    if (hasFacebookImageAttachmentError) {
      setPublishError('Vui lòng bỏ ảnh lỗi hoặc chọn ảnh hợp lệ trước khi đăng bài.');
      return;
    }

    setSubmitting(true);
    setPublishError(null);
    setFacebookPublishStatus(null);
    let facebookPlan: FacebookPublishPlan | null = null;
    let latestFacebookResults: FacebookPublishResultPayload[] = [];

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
        const planForPublish: FacebookPublishPlan = facebookImageAttachment
          ? { ...response.facebookPublishPlan, attachments: [facebookImageAttachment] }
          : response.facebookPublishPlan;
        facebookPlan = planForPublish;
        const accessToken = apiClient.getToken() ?? localStorage.getItem('token');
        if (!accessToken) {
          throw new Error('Authentication token is required for browser Facebook publishing.');
        }

        await startFacebookExtensionPublish(accessToken, planForPublish, {
          onProgress: (progress) => {
            latestFacebookResults = progress.results;
            setFacebookPublishStatus(progress.message);
          },
          onImageAttachFailed: requestFacebookImageAttachDecision,
        });
        toast({ title: 'Facebook publishing completed in this browser' });
      }
      toast({ title: 'Job posting publish requested' });
      setPublishOpen(false);
      setPublishNote('');
      clearFacebookImageAttachment();
      await reload();
    } catch (err) {
      if (facebookPlan) {
        await reportUnreportedFacebookPublishFailures(facebookPlan, latestFacebookResults, err)
          .catch(() => undefined);
        await reload().catch(() => undefined);
      }
      toast({
        title: 'Publish failed',
        description: facebookPlan
          ? `Facebook browser publishing failed after backend prepared ${facebookPlan.targets.length} target(s): ${getInternalSafeErrorMessage(err)}`
          : getInternalSafeErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      if (facebookPlan?.attachments?.length) {
        clearFacebookImageAttachment();
      }
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
      clearFacebookImageAttachment();
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
        const selectableIds = groups.filter(isSelectableFacebookGroup).map((group) => group.targetId).filter(isString);
        const retained = current.filter((targetId) => selectableIds.includes(targetId));
        if (retained.length > 0) return retained;
        return options.selectAllWhenEmpty ? selectableIds : [];
      });
      setFacebookGroupLoadState('READY');
      setFacebookGroupMessage(
        groups.length > 0
          ? `${selectedCountAfterRefresh(groups, selectedFacebookGroupIds, options.selectAllWhenEmpty)}/${countSelectableFacebookGroups(groups)} eligible Facebook group(s) selected.`
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
    const group = facebookGroups.find((item) => item.targetId === targetId);
    if (group && !isSelectableFacebookGroup(group)) {
      setFacebookGroupMessage(getFacebookGroupDisabledReason(group));
      return;
    }

    setSelectedFacebookGroupIds((current) => (
      current.includes(targetId)
        ? current.filter((item) => item !== targetId)
        : [...current, targetId]
    ));
  };

  const openFacebookImageFilePicker = () => {
    if (submitting || facebookImageAttachmentState === 'READING') return;
    facebookImageInputRef.current?.click();
  };

  const handleFacebookImageFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;

    const readSeq = facebookImageReadSeqRef.current + 1;
    facebookImageReadSeqRef.current = readSeq;
    const validationError = getFacebookImageFileValidationError(file);
    if (validationError) {
      setFacebookImageAttachment(null);
      setFacebookImageAttachmentState('ERROR');
      setFacebookImageAttachmentError(validationError);
      return;
    }

    setFacebookImageAttachment(null);
    setFacebookImageAttachmentState('READING');
    setFacebookImageAttachmentError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (facebookImageReadSeqRef.current !== readSeq) return;
      setFacebookImageAttachment({
        type: 'IMAGE',
        source: 'LOCAL_UPLOAD',
        fileName: file.name || 'facebook-image',
        mimeType: file.type,
        size: file.size,
        dataUrl,
      });
      setFacebookImageAttachmentState('READY');
    } catch (err) {
      if (facebookImageReadSeqRef.current !== readSeq) return;
      setFacebookImageAttachment(null);
      setFacebookImageAttachmentState('ERROR');
      setFacebookImageAttachmentError(getInternalSafeErrorMessage(err));
    }
  };

  const clearFacebookImageAttachment = () => {
    facebookImageReadSeqRef.current += 1;
    setFacebookImageAttachment(null);
    setFacebookImageAttachmentState('IDLE');
    setFacebookImageAttachmentError(null);
    if (facebookImageInputRef.current) {
      facebookImageInputRef.current.value = '';
    }
  };

  const requestFacebookImageAttachDecision = (
    context: FacebookImageAttachFailureContext,
  ): Promise<FacebookImageAttachFailureDecision> => {
    facebookImageAttachPromptResolverRef.current?.('SKIP');
    setFacebookImageAttachPrompt(context);

    return new Promise((resolve) => {
      facebookImageAttachPromptResolverRef.current = (decision) => {
        facebookImageAttachPromptResolverRef.current = null;
        setFacebookImageAttachPrompt(null);
        resolve(decision);
      };
    });
  };

  const resolveFacebookImageAttachPrompt = (decision: FacebookImageAttachFailureDecision) => {
    facebookImageAttachPromptResolverRef.current?.(decision);
  };

  const submitFacebookGroup = async () => {
    const targetName = facebookGroupName.trim();
    const targetUrl = facebookGroupUrl.trim();
    const targetUrlError = getFacebookGroupUrlValidationError(
      targetUrl,
      facebookGroups,
      editingFacebookGroup?.targetId ?? null,
    );
    if (targetUrlError) {
      setFacebookGroupUrlError(targetUrlError);
      setPublishError(null);
      return;
    }
    setFacebookGroupUrlError(null);
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
        await createFacebookGroup({ targetName, targetUrl });
      }
      setFacebookGroupName('');
      setFacebookGroupUrl('');
      setFacebookGroupUrlError(null);
      setEditingFacebookGroup(null);
      await refreshFacebookGroups();
    } catch (err) {
      if (isDuplicateFacebookGroupError(err)) {
        setFacebookGroupUrlError('Group đã tồn tại.');
        setPublishError(null);
      } else {
        setPublishError(getInternalSafeErrorMessage(err));
      }
    } finally {
      setFacebookGroupSaving(false);
    }
  };

  const startEditFacebookGroup = (group: FacebookPublishTarget) => {
    setEditingFacebookGroup(group);
    setFacebookGroupName(group.targetName);
    setFacebookGroupUrl(group.targetUrl ?? '');
    setFacebookGroupUrlError(null);
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

  const checkFacebookGroup = (group: FacebookPublishTarget) => {
    if (!group.targetId) return;

    if (
      activeFacebookGroupVerificationIdRef.current === group.targetId
      || facebookGroupVerificationQueueRef.current.some((item) => item.targetId === group.targetId)
    ) {
      setFacebookGroupLoadState('READY');
      setFacebookGroupMessage(`"${group.targetName}" is already queued for checking.`);
      return;
    }

    facebookGroupVerificationQueueRef.current = [...facebookGroupVerificationQueueRef.current, group];
    setQueuedFacebookGroupIds(facebookGroupVerificationQueueRef.current.map((item) => item.targetId).filter(isString));
    setFacebookGroupLoadState('READY');
    setFacebookGroupMessage(`Queued "${group.targetName}" for checking.`);
    setPublishError(null);
    void processFacebookGroupVerificationQueue();
  };

  const processFacebookGroupVerificationQueue = async () => {
    if (facebookGroupVerificationRunningRef.current) return;
    facebookGroupVerificationRunningRef.current = true;

    let checkedCount = 0;
    let issueCount = 0;
    const queuedAtStart = facebookGroupVerificationQueueRef.current.length;

    try {
      while (facebookGroupVerificationQueueRef.current.length > 0) {
        const group = facebookGroupVerificationQueueRef.current[0];
        facebookGroupVerificationQueueRef.current = facebookGroupVerificationQueueRef.current.slice(1);
        setQueuedFacebookGroupIds(facebookGroupVerificationQueueRef.current.map((item) => item.targetId).filter(isString));

        if (!group.targetId) continue;

        activeFacebookGroupVerificationIdRef.current = group.targetId;
        setVerifyingFacebookGroupIds([group.targetId]);
        setFacebookGroupLoadState('READY');
        setFacebookGroupMessage(`Checking "${group.targetName}" (${checkedCount + 1}/${Math.max(queuedAtStart, checkedCount + 1)}) with the current Facebook browser session.`);

        try {
          const result = await verifyFacebookGroupInBrowser(group);
          const savedGroup = await verifyFacebookGroup(group.targetId, result);
          const groups = replaceFacebookGroup(facebookGroupsRef.current, savedGroup);
          facebookGroupsRef.current = groups;
          setFacebookGroups(groups);
          const selectableIds = new Set(groups.filter(isSelectableFacebookGroup).map((item) => item.targetId).filter(isString));
          setSelectedFacebookGroupIds((current) => {
            const retained = current.filter((targetId) => selectableIds.has(targetId));
            return retained;
          });
          checkedCount += 1;
          if (!savedGroup.selectable) issueCount += 1;
          setFacebookGroupMessage(
            savedGroup.selectable
              ? `"${savedGroup.targetName}" can be used for publishing (${savedGroup.quotaLabel} today).`
              : getFacebookGroupVerificationMessage(savedGroup),
          );
        } catch (err) {
          const message = getInternalSafeErrorMessage(err);
          checkedCount += 1;
          issueCount += 1;
          setFacebookGroupLoadState('READY');
          setFacebookGroupMessage(`Could not check "${group.targetName}": ${message}`);
          setPublishError(message);
        } finally {
          activeFacebookGroupVerificationIdRef.current = null;
          setVerifyingFacebookGroupIds([]);
        }
      }

      if (checkedCount > 0) {
        setFacebookGroupLoadState('READY');
        setFacebookGroupMessage(
          issueCount > 0
            ? `Checked ${checkedCount} Facebook group(s). ${issueCount} group(s) need attention.`
            : `Checked ${checkedCount} Facebook group(s). All checked groups can be used if quota allows.`,
        );
      }
    } finally {
      facebookGroupVerificationRunningRef.current = false;
      activeFacebookGroupVerificationIdRef.current = null;
      setVerifyingFacebookGroupIds([]);
      setQueuedFacebookGroupIds(facebookGroupVerificationQueueRef.current.map((item) => item.targetId).filter(isString));

      if (facebookGroupVerificationQueueRef.current.length > 0) {
        void processFacebookGroupVerificationQueue();
      }
    }
  };

  const status = jobPosting?.status;
  const closedLike = status === 'CLOSED' || status === 'ARCHIVED';
  const publishedLike = status === 'PUBLISHED';
  const publicSlug = jobPosting?.publicSlug ?? '';
  const facebookGroupVerificationBusy = verifyingFacebookGroupIds.length > 0 || queuedFacebookGroupIds.length > 0;
  const isFacebookImageReading = facebookImageAttachmentState === 'READING';
  const hasFacebookImageAttachmentError = facebookImageAttachmentState === 'ERROR';
  const publishSubmitDisabled = submitting || isFacebookImageReading || hasFacebookImageAttachmentError;
  const facebookGroupDuplicateUrlError = getDuplicateFacebookGroupUrlError(
    facebookGroupUrl,
    facebookGroups,
    editingFacebookGroup?.targetId ?? null,
  );
  const facebookGroupUrlFieldError = facebookGroupDuplicateUrlError ?? facebookGroupUrlError;

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
            setFacebookPublishStatus(null);
            clearFacebookImageAttachment();
          }
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
                      {isFacebookBusy(facebookGroupLoadState) || facebookGroupVerificationBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-emerald-900 hover:bg-emerald-100"
                        disabled={submitting || isFacebookBusy(facebookGroupLoadState) || facebookGroupVerificationBusy}
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
                      {(isFacebookBusy(facebookGroupLoadState) || facebookGroupVerificationBusy) && facebookGroupMessage
                        ? facebookGroupMessage
                        : `${selectedFacebookGroupIds.length}/${countSelectableFacebookGroups(facebookGroups)} eligible Facebook group(s) selected.`}
                    </p>

                    {facebookGroups.length > 0 ? (
                      <div className="max-h-72 divide-y divide-emerald-100 overflow-y-auto rounded-md bg-white">
                        {facebookGroups.map((group) => {
                          const isGroupChecking = Boolean(group.targetId && verifyingFacebookGroupIds.includes(group.targetId));
                          const isGroupQueued = Boolean(group.targetId && queuedFacebookGroupIds.includes(group.targetId));
                          const groupStatusMessage = isGroupChecking
                            ? 'Checking with the current Facebook browser session...'
                            : isGroupQueued
                              ? 'Queued for checking.'
                              : getFacebookGroupDisabledReason(group);

                          return (
                          <div
                            key={group.targetId ?? group.targetUrl ?? group.targetName}
                            className={cn(
                              'flex items-center justify-between gap-3 px-3 py-2',
                              !isSelectableFacebookGroup(group) && 'bg-slate-50 text-muted-foreground',
                            )}
                          >
                            <label className="flex min-w-0 flex-1 items-start gap-2 text-sm">
                              <input
                                className="mt-1"
                                type="checkbox"
                                checked={Boolean(group.targetId && selectedFacebookGroupIds.includes(group.targetId))}
                                disabled={submitting || !group.targetId || !isSelectableFacebookGroup(group)}
                                onChange={() => toggleFacebookGroupSelection(group.targetId)}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate">{group.targetName}</span>
                                <span className="mt-1 flex flex-wrap gap-1">
                                  <Badge variant="outline" className={cn('text-[10px]', getFacebookEligibilityClass(group.eligibilityStatus))}>
                                    {getFacebookEligibilityLabel(group.eligibilityStatus)}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'text-[10px]',
                                      group.quotaExceeded
                                        ? 'border-red-200 bg-red-50 text-red-700'
                                        : 'border-slate-200 bg-slate-50 text-slate-700',
                                    )}
                                  >
                                    {group.quotaLabel ?? `${group.todayPublishCount ?? 0}/${group.dailyPublishLimit ?? 10}`} today
                                  </Badge>
                                </span>
                                {groupStatusMessage ? (
                                  <span className="mt-1 block text-xs text-amber-700">
                                    {groupStatusMessage}
                                  </span>
                                ) : null}
                              </span>
                            </label>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                disabled={submitting || isGroupChecking || isGroupQueued || !group.targetId}
                                onClick={() => void checkFacebookGroup(group)}
                              >
                                <RefreshCw className={cn('h-3.5 w-3.5', isGroupChecking && 'animate-spin')} />
                              </Button>
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
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-emerald-300 bg-white p-3 text-sm text-muted-foreground">
                        No Facebook groups are configured for this account yet.
                      </div>
                    )}

                    <div className="space-y-2 rounded-md border border-emerald-200 bg-white p-3">
                      <input
                        ref={facebookImageInputRef}
                        type="file"
                        accept={FACEBOOK_IMAGE_ACCEPT}
                        className="hidden"
                        onChange={(event) => void handleFacebookImageFileChange(event)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={submitting || isFacebookImageReading}
                        onClick={openFacebookImageFilePicker}
                      >
                        {isFacebookImageReading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <ImagePlus className="mr-2 h-4 w-4" />
                        )}
                        Upload ảnh
                      </Button>
                      {facebookImageAttachment ? (
                        <div className="flex items-center gap-3 rounded-md border bg-slate-50 p-2">
                          <img
                            src={facebookImageAttachment.dataUrl}
                            alt=""
                            className="h-14 w-14 rounded object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{facebookImageAttachment.fileName}</p>
                            <p className="text-xs text-muted-foreground">{formatFileSize(facebookImageAttachment.size)}</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={submitting || isFacebookImageReading}
                            onClick={clearFacebookImageAttachment}
                          >
                            Bỏ ảnh
                          </Button>
                        </div>
                      ) : null}
                      {isFacebookImageReading ? (
                        <p className="text-xs text-muted-foreground">Đang xử lý ảnh...</p>
                      ) : null}
                      {facebookImageAttachmentError ? (
                        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-2">
                          <p className="text-xs font-medium text-destructive">{facebookImageAttachmentError}</p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={clearFacebookImageAttachment}
                          >
                            Bỏ ảnh
                          </Button>
                        </div>
                      ) : null}
                    </div>

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
                              setFacebookGroupUrlError(null);
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
                              aria-invalid={Boolean(facebookGroupUrlFieldError)}
                              className={cn(
                                facebookGroupUrlFieldError
                                  && 'border-destructive focus-visible:ring-destructive/30',
                              )}
                              onChange={(event) => {
                                setFacebookGroupUrl(event.target.value);
                                setFacebookGroupUrlError(null);
                              }}
                            />
                            {facebookGroupUrlFieldError ? (
                              <p className="text-xs font-medium text-destructive">{facebookGroupUrlFieldError}</p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            disabled={facebookGroupSaving || Boolean(facebookGroupUrlFieldError)}
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
              <Button type="submit" disabled={publishSubmitDisabled}>
                <CheckCircle className="mr-2 h-4 w-4" />
                {submitting ? 'Publishing...' : isFacebookImageReading ? 'Loading image...' : 'Publish'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(facebookImageAttachPrompt)}
        onOpenChange={(open) => {
          if (!open && facebookImageAttachPrompt) {
            resolveFacebookImageAttachPrompt('SKIP');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Không attach được ảnh</DialogTitle>
            <DialogDescription>
              {facebookImageAttachPrompt?.target.targetName}
            </DialogDescription>
          </DialogHeader>
          {facebookImageAttachPrompt ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-md border bg-slate-50 p-2">
                <img
                  src={facebookImageAttachPrompt.attachment.dataUrl}
                  alt=""
                  className="h-16 w-16 rounded object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{facebookImageAttachPrompt.attachment.fileName}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(facebookImageAttachPrompt.attachment.size)}</p>
                </div>
              </div>
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {facebookImageAttachPrompt.message}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => resolveFacebookImageAttachPrompt('SKIP')}
                >
                  Không đăng bài này
                </Button>
                <Button
                  type="button"
                  onClick={() => resolveFacebookImageAttachPrompt('POST_TEXT_ONLY')}
                >
                  Vẫn đăng text-only
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
