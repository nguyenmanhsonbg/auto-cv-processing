import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  type FacebookPublishPlan,
  type FacebookPublishProgress,
  type FacebookPublishResultPayload,
  type JobPostingChannelStatus,
} from '@/lib/recruitment-api';

interface FacebookPublishResultsPanelProps {
  progress: FacebookPublishProgress | null;
  plan: FacebookPublishPlan | null;
  channels: JobPostingChannelStatus[];
}

function resultKey(result: FacebookPublishResultPayload) {
  return result.targetId ?? result.targetUrl ?? result.targetName;
}

function targetKey(target: FacebookPublishPlan['targets'][number]) {
  return target.targetId ?? target.targetUrl ?? target.targetName;
}

function channelLabel(channel?: string | null) {
  switch (channel) {
    case 'VCS_PORTAL':
      return 'VCS Portal';
    case 'FACEBOOK':
      return 'Facebook';
    case 'LINKEDIN':
      return 'LinkedIn';
    case 'TOPCV':
      return 'TopCV';
    case 'VIETNAMWORKS':
      return 'VietnamWorks';
    default:
      return channel ?? '-';
  }
}

function getChannelStatus(status?: string | null) {
  switch (status) {
    case 'PUBLISHED':
      return { label: 'Đã đăng', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
    case 'PUBLISH_FAILED':
    case 'FAILED':
      return { label: 'Đăng lỗi', className: 'border-red-200 bg-red-50 text-red-700' };
    case 'PUBLISHING':
      return { label: 'Đang xử lý', className: 'border-amber-200 bg-amber-50 text-amber-700' };
    case 'MANUAL_REQUIRED':
      return { label: 'Cần thao tác', className: 'border-amber-200 bg-amber-50 text-amber-700' };
    default:
      return { label: status ?? 'Đang chờ', className: 'border-slate-200 bg-slate-50 text-slate-600' };
  }
}

function getFacebookChannelStatus(progress: FacebookPublishProgress | null) {
  if (!progress) {
    return { label: 'Đang đăng', className: 'border-amber-200 bg-amber-50 text-amber-700' };
  }

  if (progress.status === 'SUCCESS') {
    return { label: 'Đã đăng', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
  }
  if (progress.status === 'PARTIAL_SUCCESS' || progress.status === 'ERROR') {
    return { label: 'Đăng lỗi', className: 'border-red-200 bg-red-50 text-red-700' };
  }

  return { label: 'Đang đăng', className: 'border-amber-200 bg-amber-50 text-amber-700' };
}

function getGroupStatus(
  group: FacebookPublishPlan['targets'][number],
  progress: FacebookPublishProgress | null,
  result: FacebookPublishResultPayload | undefined,
) {
  if (result?.status === 'SUCCESS') {
    return { label: 'Đã đăng', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
  }
  if (result?.status === 'FAILED') {
    return { label: 'Đăng lỗi', className: 'border-red-200 bg-red-50 text-red-700' };
  }
  if (result?.status === 'SKIPPED') {
    return { label: 'Đăng lỗi', className: 'border-red-200 bg-red-50 text-red-700' };
  }

  const active = progress?.status === 'POSTING' || progress?.status === 'REPORTING';
  const isActive = active && (
    progress?.target?.targetId === group.targetId
      || progress?.target?.targetName === group.targetName
  );
  if (progress?.status === 'PARTIAL_SUCCESS' || progress?.status === 'ERROR') {
    return { label: 'Đăng lỗi', className: 'border-red-200 bg-red-50 text-red-700' };
  }
  return isActive
    ? { label: 'Đang đăng', className: 'border-amber-200 bg-amber-50 text-amber-700' }
    : { label: 'Đang đăng', className: 'border-amber-200 bg-amber-50 text-amber-700' };
}

export function FacebookPublishResultsPanel({
  progress,
  plan,
  channels,
}: FacebookPublishResultsPanelProps) {
  const [facebookExpanded, setFacebookExpanded] = useState(true);
  const [expandedChannels, setExpandedChannels] = useState<Record<string, boolean>>({});
  const progressResults = progress?.results ?? [];
  const progressByTarget = new Map(progressResults.map((item) => [resultKey(item), item]));
  const targets = plan?.targets ?? progressResults.map((item) => ({
    targetId: item.targetId ?? null,
    targetType: item.targetType,
    targetName: item.targetName,
    targetUrl: item.targetUrl ?? null,
    eligibilityStatus: 'UNKNOWN' as const,
    todayPublishCount: 0,
    dailyPublishLimit: 0,
    quotaLabel: '',
    quotaExceeded: false,
    selectable: false,
  }));
  const facebookStatus = getFacebookChannelStatus(progress);
  const otherChannels = channels.filter((channel) => channel.channel !== 'FACEBOOK');

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" aria-label="Kết quả đăng">
      <h2 className="text-base font-semibold">Kết quả</h2>

      <div className="border-t border-slate-200 pt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Facebook</span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn('rounded-full', facebookStatus.className)}>
              {facebookStatus.label}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-expanded={facebookExpanded}
              aria-label={facebookExpanded ? 'Thu gọn kết quả Facebook' : 'Mở rộng kết quả Facebook'}
              title={facebookExpanded ? 'Thu gọn kết quả' : 'Mở rộng kết quả'}
              onClick={() => setFacebookExpanded((current) => !current)}
            >
              {facebookExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {facebookExpanded ? (
          <div className="mt-2 max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-100">
            {targets.length > 0 ? targets.map((group) => {
              const groupResult = progressByTarget.get(targetKey(group));
              const groupStatus = getGroupStatus(group, progress, groupResult);
              return (
                <div key={targetKey(group)} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <span className="min-w-0 truncate text-slate-700" title={group.targetName}>{group.targetName}</span>
                  <Badge variant="outline" className={cn('shrink-0 rounded-full', groupStatus.className)}>
                    {groupStatus.label}
                  </Badge>
                </div>
              );
            }) : (
              <p className="px-3 py-3 text-xs text-muted-foreground">Chưa có nhóm Facebook được chọn.</p>
            )}
          </div>
        ) : null}
      </div>

      {otherChannels.map((channel) => {
        const key = channel.channel ?? 'UNKNOWN';
        const expanded = expandedChannels[key] ?? true;
        const status = getChannelStatus(channel.status);
        return (
          <div key={key} className="border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">{channelLabel(channel.channel)}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn('rounded-full', status.className)}>{status.label}</Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-expanded={expanded}
                  aria-label={expanded ? `Thu gọn kênh ${channelLabel(channel.channel)}` : `Mở rộng kênh ${channelLabel(channel.channel)}`}
                  title={expanded ? 'Thu gọn kênh' : 'Mở rộng kênh'}
                  onClick={() => setExpandedChannels((current) => ({ ...current, [key]: !expanded }))}
                >
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {expanded ? (
              <div className="mt-2 text-xs text-muted-foreground">
                {channel.publishedUrl ? (
                  <a href={channel.publishedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    Open <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : channel.manualInstruction ?? 'Chưa có liên kết bài đăng'}
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
