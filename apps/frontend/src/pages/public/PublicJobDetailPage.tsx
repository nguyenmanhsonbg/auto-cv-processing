import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, Calendar, MapPin } from 'lucide-react';
import { ApiError } from '@/lib/api-client';
import {
  getPublicJobPosting,
  type PublicJobPostingDetail,
} from '@/lib/recruitment-public-api';
import { getPublicSafeErrorMessage } from '@/lib/api-errors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringifyPublicValue(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(stringifyPublicValue).filter(Boolean).join(', ');
  if (isPlainRecord(value)) {
    return Object.entries(value)
      .map(([key, item]) => {
        const rendered = stringifyPublicValue(item);
        return rendered ? `${key}: ${rendered}` : '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function PublicInfoBlock({ title, value }: { title: string; value: unknown }) {
  const rendered = stringifyPublicValue(value);
  if (!rendered) return null;

  return (
    <section className="space-y-2 border-t pt-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="whitespace-pre-line text-sm leading-6 text-muted-foreground">
        {rendered}
      </div>
    </section>
  );
}

function isApplyOpen(job: PublicJobPostingDetail) {
  const now = Date.now();
  const openAt = job.openAt ? new Date(job.openAt).getTime() : null;
  const closeAt = job.closeAt ? new Date(job.closeAt).getTime() : null;

  if (job.status !== 'PUBLISHED') return false;
  if (openAt && openAt > now) return false;
  if (closeAt && closeAt <= now) return false;
  return true;
}

export function PublicJobDetailPage() {
  const { slug } = useParams();
  const [job, setJob] = useState<PublicJobPostingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadJob() {
      if (!slug) {
        setError('Không tìm thấy tin tuyển dụng.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await getPublicJobPosting(slug);
        if (active) setJob(data);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          setError('Không tìm thấy tin tuyển dụng hoặc tin đã ngừng nhận hồ sơ.');
        } else {
          setError(getPublicSafeErrorMessage(err));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadJob();

    return () => {
      active = false;
    };
  }, [slug]);

  const applyOpen = useMemo(() => (job ? isApplyOpen(job) : false), [job]);
  const closeDate = formatDate(job?.closeAt);
  const openDate = formatDate(job?.openAt);
  const levelLabel = job?.level?.displayName ?? job?.level?.name;

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <div className="space-y-3">
          <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Card>
          <CardContent className="flex gap-3 pt-6">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="space-y-2">
              <h1 className="text-xl font-semibold">Không thể mở tin tuyển dụng</h1>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!job) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Không có dữ liệu tin tuyển dụng.
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={applyOpen ? 'default' : 'secondary'}>
            {applyOpen ? 'Đang nhận hồ sơ' : 'Tạm ngừng nhận hồ sơ'}
          </Badge>
          {job.position?.name && <Badge variant="outline">{job.position.name}</Badge>}
          {levelLabel && <Badge variant="outline">{levelLabel}</Badge>}
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {job.title}
            </h1>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {job.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {job.location}
                </span>
              )}
              {job.workingMode && <span>{job.workingMode}</span>}
              {(openDate || closeDate) && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {openDate ? `Mở từ ${openDate}` : null}
                  {openDate && closeDate ? ' · ' : null}
                  {closeDate ? `Hạn ${closeDate}` : null}
                </span>
              )}
            </div>
          </div>

          <Button asChild disabled={!applyOpen}>
            {applyOpen ? (
              <Link to="apply">Ứng tuyển</Link>
            ) : (
              <span>Đã đóng</span>
            )}
          </Button>
        </div>
      </section>

      {!applyOpen && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6 text-sm text-amber-900">
            Tin tuyển dụng hiện chưa nhận hồ sơ. Vui lòng quay lại sau hoặc chọn vị trí khác.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Thông tin tuyển dụng</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <PublicInfoBlock title="Mô tả tóm tắt" value={job.summary} />
          <PublicInfoBlock title="Mô tả công việc" value={job.description} />
          <PublicInfoBlock title="Yêu cầu" value={job.requirements} />
          <PublicInfoBlock title="Quyền lợi" value={job.benefits} />
        </CardContent>
      </Card>
    </main>
  );
}
