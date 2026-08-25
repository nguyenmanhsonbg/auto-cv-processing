import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, ExternalLink, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getInternalSafeErrorMessage } from '@/lib/api-errors';
import { formatRecruitmentDateTime } from '@/lib/date-time';
import {
  listAssignedInterviewEvaluations,
  type AssignedInterviewEvaluation,
} from '@/lib/recruitment-api';

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    READY_TO_EVALUATE: 'Sẵn sàng đánh giá',
    DRAFT: 'Bản nháp',
    WAITING_COMMITTEE: 'Chờ HĐCM',
    IN_REVIEW: 'Đang đánh giá',
    WAITING_AGGREGATION: 'Chờ tổng hợp',
    NEEDS_REVISION: 'Cần bổ sung',
    COMPLETED: 'Đã hoàn tất',
    LOCKED: 'Đã khóa',
  };
  return labels[status] ?? status;
}

function statusClass(status: string) {
  if (status === 'COMPLETED' || status === 'LOCKED') return 'bg-green-100 text-green-800';
  if (status === 'WAITING_COMMITTEE' || status === 'WAITING_AGGREGATION') return 'bg-amber-100 text-amber-800';
  return 'bg-blue-100 text-blue-800';
}

function assignedDate(item: AssignedInterviewEvaluation) {
  return item.reviewer.submittedAt
    ? formatRecruitmentDateTime(item.reviewer.submittedAt)
    : 'Chưa gửi đánh giá';
}

export function InterviewEvaluationInboxPage() {
  const [items, setItems] = useState<AssignedInterviewEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listAssignedInterviewEvaluations());
    } catch (err) {
      setError(getInternalSafeErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">HĐCM – Hội đồng chuyên môn</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Phiếu đánh giá được giao</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Chỉ hiển thị các ứng viên và vòng phỏng vấn đã được phân công cho bạn.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Làm mới
        </Button>
      </div>

      {error ? (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center justify-between gap-4 p-6">
            <p className="text-sm text-destructive">{error}</p>
            <Button type="button" variant="outline" onClick={() => void load()}>Thử lại</Button>
          </CardContent>
        </Card>
      ) : null}

      {loading ? <p className="text-sm text-muted-foreground">Đang tải phiếu được giao...</p> : null}

      {!loading && !error && items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <ClipboardCheck className="h-10 w-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Chưa có phiếu đánh giá được giao</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Khi HR phân công bạn vào một vòng phỏng vấn, phiếu sẽ xuất hiện tại đây.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4">
        {items.map((item) => (
          <Card key={`${item.caseId}-${item.round.id}`}>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl">{item.candidate.name ?? 'Ứng viên chưa có tên'}</CardTitle>
                <CardDescription className="mt-1">
                  {[item.candidate.email, item.candidate.phone].filter(Boolean).join(' • ') || 'Chưa có thông tin liên hệ'}
                </CardDescription>
              </div>
              <Badge className={statusClass(item.round.status)}>{statusLabel(item.round.status)}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 rounded-md bg-muted/40 p-4 text-sm sm:grid-cols-3">
                <div><p className="text-muted-foreground">JD</p><p className="font-medium">{item.job.title ?? 'Chưa xác định'}</p></div>
                <div><p className="text-muted-foreground">Vòng</p><p className="font-medium">{item.round.name}</p></div>
                <div><p className="text-muted-foreground">Tiến độ HĐCM</p><p className="font-medium">{item.reviewerProgress.submitted}/{item.reviewerProgress.total} đã gửi</p></div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">{assignedDate(item)}</p>
                <Button asChild>
                  <Link
                    to={`/interview-evaluations/${encodeURIComponent(item.applicationId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Mở phiếu đánh giá
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
