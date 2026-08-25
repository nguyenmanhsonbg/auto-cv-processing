import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Clock3, FileText, LockKeyhole, Save, Send, Users } from 'lucide-react';
import { UserRole } from '@interview-assistant/shared';
import type {
  InterviewEvaluationFormData,
  InterviewEvaluationReviewerSection,
} from '@interview-assistant/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { getInternalSafeErrorMessage } from '@/lib/api-errors';
import { useAuthContext } from '@/lib/auth-context';
import {
  aggregateInterviewEvaluation,
  completeInterviewEvaluation,
  createNextInterviewEvaluationRound,
  getInterviewEvaluation,
  saveInterviewEvaluationReview,
  submitInterviewEvaluationReview,
  type InterviewEvaluationDetail,
  type InterviewEvaluationReviewerRecord,
} from '@/lib/recruitment-api';
import { formatRecruitmentDateTime } from '@/lib/date-time';
import { useToast } from '@/components/ui/use-toast';

const EMPTY_FORM: InterviewEvaluationFormData = {
  overall: { result: 'PENDING', strengths: '', concerns: '', notes: '' },
  hrbp: {
    educationCertificates: '',
    foreignLanguage: '',
    experienceSummary: '',
    projectsHighlights: '',
    developmentMotivation: '',
    onboardingTimeline: '',
    concerns: '',
    level: '',
    placement: '',
    salaryExpectation: '',
    noticePeriod: '',
    motivation: '',
    notes: '',
  },
  committee: {
    technicalRating: 0,
    problemSolvingRating: 0,
    communicationRating: 0,
    teamworkRating: 0,
    leadershipRating: 0,
    notes: '',
  },
  final: { result: 'PENDING', proposedLevel: '', proposedSalary: '', nextAction: '', notes: '' },
};

function cloneFormData(data?: InterviewEvaluationFormData | null): InterviewEvaluationFormData {
  return {
    overall: { ...EMPTY_FORM.overall, ...data?.overall },
    hrbp: { ...EMPTY_FORM.hrbp, ...data?.hrbp },
    committee: { ...EMPTY_FORM.committee, ...data?.committee },
    final: { ...EMPTY_FORM.final, ...data?.final },
  };
}

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

function sectionLabel(section: InterviewEvaluationReviewerSection) {
  return section === 'HRBP' ? 'HRBP' : 'Hội đồng chuyên môn';
}

function findCurrentReviewer(detail: InterviewEvaluationDetail | null, userId?: string) {
  if (!detail || !userId) return undefined;
  return detail.reviewers.find((reviewer) => reviewer.userId === userId);
}

function readOnlyValue(value?: string | number | null) {
  if (value === undefined || value === null || value === '') return 'Chưa nhập';
  return `${value}`;
}

type HrbpFieldKey =
  | 'educationCertificates'
  | 'foreignLanguage'
  | 'experienceSummary'
  | 'projectsHighlights'
  | 'developmentMotivation'
  | 'onboardingTimeline'
  | 'concerns';

type HrbpFieldDefinition = Readonly<{
  key: HrbpFieldKey;
  label: string;
  multiline: boolean;
}>;

const HRBP_FIELDS: readonly HrbpFieldDefinition[] = [
  { key: 'educationCertificates', label: 'Bằng cấp, chứng chỉ', multiline: true },
  { key: 'foreignLanguage', label: 'Ngoại ngữ', multiline: true },
  { key: 'experienceSummary', label: 'Tổng quan kỹ năng kinh nghiệm', multiline: true },
  { key: 'projectsHighlights', label: 'Dự án & kết quả nổi bật', multiline: true },
  { key: 'developmentMotivation', label: 'Động lực phát triển', multiline: true },
  { key: 'onboardingTimeline', label: 'Thời gian dự kiến onboard', multiline: false },
  { key: 'concerns', label: 'Điểm cần lưu ý', multiline: true },
];

function getHrbpValue(hrbp: InterviewEvaluationFormData['hrbp'], field: HrbpFieldKey) {
  if (field === 'developmentMotivation') return hrbp?.developmentMotivation || hrbp?.motivation;
  if (field === 'concerns') return hrbp?.concerns || hrbp?.notes;
  return hrbp?.[field];
}

function HrbpSectionHeader({ readOnly }: Readonly<{ readOnly: boolean }>) {
  return <CardHeader className="border-b border-slate-200 bg-[#dceaf2]"><CardTitle className="flex items-center gap-2 text-[#1f3b70]"><Users className="h-4 w-4" />II. ĐÁNH GIÁ TỪ HRBP PHỤ TRÁCH {readOnly ? <Badge variant="outline">Chỉ xem</Badge> : null}</CardTitle><p className="text-xs italic leading-5 text-slate-600">Mục này do HRBP hoàn thiện trước buổi phỏng vấn chuyên môn, dựa trên hồ sơ CV, kết quả phone screening và quan sát trong quá trình tiếp xúc. Đây là cơ sở quan trọng để HM/HĐCM và BGĐ đánh giá toàn diện ứng viên.</p>{readOnly ? <p className="text-xs text-slate-600">Nội dung HRBP đã nhập được chia sẻ để HĐCM tham khảo.</p> : null}</CardHeader>;
}

function ReadOnlyHrbpRow({ label, value }: Readonly<{ label: string; value?: string | null }>) {
  return <div className="grid gap-0 border-b border-slate-200 last:border-b-0 sm:grid-cols-[220px_minmax(0,1fr)]"><div className="bg-[#e6f1f5] px-3 py-3 text-sm font-medium text-slate-700">{label}</div><div className="min-h-12 whitespace-pre-wrap px-3 py-3 text-sm text-slate-800">{readOnlyValue(value)}</div></div>;
}

function EditableHrbpRow({ field, value, disabled, onChange }: Readonly<{ field: HrbpFieldDefinition; value: string; disabled: boolean; onChange: (value: string) => void }>) {
  const controlId = `hrbp-${field.key}`;
  return <div className="grid gap-2 border-b border-slate-200 p-3 last:border-b-0 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-4"><label className="flex items-start pt-2 text-sm font-medium text-slate-700" htmlFor={controlId}>{field.label}</label>{field.multiline ? <Textarea id={controlId} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /> : <Input id={controlId} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />}</div>;
}

function ReadOnlyValue({ label, value }: Readonly<{ label: string; value?: string | number | null }>) {
  return <div className="rounded-md border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{readOnlyValue(value)}</p></div>;
}

function ReadOnlyHrbpSection({ data }: Readonly<{ data: InterviewEvaluationFormData }>) {
  const hrbp = data.hrbp ?? {};
  return <Card id="hrbp" className="border-slate-200 shadow-sm"><HrbpSectionHeader readOnly /><CardContent className="pt-5"><div className="overflow-hidden rounded-md border border-slate-200">{HRBP_FIELDS.map((field) => <ReadOnlyHrbpRow key={field.key} label={field.label} value={getHrbpValue(hrbp, field.key)} />)}</div></CardContent></Card>;
}

function ReadOnlyCommitteeSection({ reviewers }: Readonly<{ reviewers: InterviewEvaluationReviewerRecord[] }>) {
  const committeeReviewers = reviewers.filter((reviewer) => reviewer.section === 'COMMITTEE');
  return <Card id="committee" className="border-slate-200 shadow-sm"><CardHeader className="border-b border-slate-200 bg-[#dceaf2]"><CardTitle className="flex items-center gap-2 text-[#1f3b70]"><Users className="h-4 w-4" />III. Đánh giá của Hội đồng chuyên môn <Badge variant="outline">Chỉ xem</Badge></CardTitle><p className="text-xs text-slate-600">HR/Admin được xem nội dung đánh giá của HĐCM nhưng không được chỉnh sửa.</p></CardHeader><CardContent className="space-y-4 pt-5">{committeeReviewers.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có thành viên HĐCM được phân công.</p> : committeeReviewers.map((reviewer) => { const committee = reviewer.formData?.committee ?? {}; return <div key={reviewer.id} className="space-y-3 rounded-lg border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-slate-900">{reviewer.name}</p><p className="text-xs text-slate-500">{reviewer.email ?? 'Không có email'}</p></div><Badge variant="outline">{statusLabel(reviewer.status)}</Badge></div><div className="grid gap-3 md:grid-cols-2"><ReadOnlyValue label="Kiến thức chuyên môn" value={committee.technicalRating ? `${committee.technicalRating}/5` : null} /><ReadOnlyValue label="Giải quyết vấn đề" value={committee.problemSolvingRating ? `${committee.problemSolvingRating}/5` : null} /><ReadOnlyValue label="Giao tiếp" value={committee.communicationRating ? `${committee.communicationRating}/5` : null} /><ReadOnlyValue label="Làm việc nhóm" value={committee.teamworkRating ? `${committee.teamworkRating}/5` : null} /><ReadOnlyValue label="Leadership / ownership" value={committee.leadershipRating ? `${committee.leadershipRating}/5` : null} /><ReadOnlyValue label="Đánh giá / dẫn chứng cụ thể" value={committee.notes} /></div></div>; })}</CardContent></Card>;
}

function ReadOnlyCommitteeReviews({ reviewers, currentUserId }: Readonly<{ reviewers: InterviewEvaluationReviewerRecord[]; currentUserId?: string }>) {
  const submittedReviews = reviewers.filter(
    (reviewer) => reviewer.section === 'COMMITTEE'
      && reviewer.userId !== currentUserId
      && reviewer.status === 'SUBMITTED'
      && reviewer.formData,
  );
  return <Card id="peer-reviews" className="border-slate-200 shadow-sm"><CardHeader className="border-b border-slate-200 bg-[#dceaf2]"><CardTitle className="flex items-center gap-2 text-[#1f3b70]"><Users className="h-4 w-4" />Đánh giá HĐCM đã gửi <Badge variant="outline">Chỉ xem</Badge></CardTitle><p className="text-xs text-slate-600">Chỉ hiển thị đánh giá của thành viên khác sau khi họ đã gửi.</p></CardHeader><CardContent className="space-y-4 pt-5">{submittedReviews.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có đánh giá HĐCM nào khác đã gửi.</p> : submittedReviews.map((reviewer) => { const committee = reviewer.formData?.committee ?? {}; const overall = reviewer.formData?.overall ?? {}; return <div key={reviewer.id} className="space-y-3 rounded-lg border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-slate-900">{reviewer.name}</p><p className="text-xs text-slate-500">{reviewer.email ?? 'Không có email'}</p></div><Badge className="bg-emerald-100 text-emerald-800">Đã gửi</Badge></div><div className="grid gap-3 md:grid-cols-2"><ReadOnlyValue label="Kiến thức chuyên môn" value={committee.technicalRating ? `${committee.technicalRating}/5` : null} /><ReadOnlyValue label="Giải quyết vấn đề" value={committee.problemSolvingRating ? `${committee.problemSolvingRating}/5` : null} /><ReadOnlyValue label="Giao tiếp" value={committee.communicationRating ? `${committee.communicationRating}/5` : null} /><ReadOnlyValue label="Làm việc nhóm" value={committee.teamworkRating ? `${committee.teamworkRating}/5` : null} /><ReadOnlyValue label="Leadership / ownership" value={committee.leadershipRating ? `${committee.leadershipRating}/5` : null} /><ReadOnlyValue label="Kết quả đề xuất" value={overall.result} /><ReadOnlyValue label="Đánh giá / dẫn chứng" value={committee.notes} /><ReadOnlyValue label="Ghi chú" value={overall.notes} /></div></div>; })}</CardContent></Card>;
}

const RATING_STYLES: Record<number, string> = {
  1: 'border-red-300 bg-red-50 text-red-700',
  2: 'border-amber-300 bg-amber-50 text-amber-700',
  3: 'border-yellow-300 bg-yellow-50 text-yellow-700',
  4: 'border-lime-300 bg-lime-50 text-lime-700',
  5: 'border-emerald-300 bg-emerald-50 text-emerald-700',
};

function RatingScale({ value, disabled, onChange }: Readonly<{ value?: number; disabled: boolean; onChange: (value: number) => void }>) {
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          disabled={disabled}
          className={`h-9 w-9 rounded-md border text-sm font-semibold transition-colors ${value === rating ? RATING_STYLES[rating] : 'border-slate-200 bg-white text-slate-500 hover:border-blue-300 hover:bg-blue-50'}`}
          onClick={() => onChange(rating)}
          aria-label={`Đánh giá ${rating} trên 5`}
        >
          {rating}
        </button>
      ))}
    </div>
  );
}

export function InterviewEvaluationPage() {
  const { applicationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { toast } = useToast();
  const [detail, setDetail] = useState<InterviewEvaluationDetail | null>(null);
  const [formData, setFormData] = useState<InterviewEvaluationFormData>(cloneFormData());
  const [aggregateData, setAggregateData] = useState<InterviewEvaluationFormData>(cloneFormData());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const editRevision = useRef(0);

  const currentReviewer = useMemo(
    () => findCurrentReviewer(detail, user?.id),
    [detail, user?.id],
  );
  const reviewerSection = currentReviewer?.section;
  const canReview = Boolean(
    currentReviewer
      && detail?.permissions.canReview,
  );
  const isManager = user?.role === UserRole.ADMIN || user?.role === UserRole.HR;

  const applyDetail = useCallback((nextDetail: InterviewEvaluationDetail) => {
    setDetail(nextDetail);
    setSelectedRoundId(nextDetail.currentRound.id);
    const reviewer = findCurrentReviewer(nextDetail, user?.id);
    setFormData(cloneFormData(reviewer?.formData));
    setAggregateData(cloneFormData(nextDetail.currentRound.aggregateData));
    setDirty(false);
  }, [user?.id]);

  const loadDetail = useCallback(async (roundId?: string) => {
    if (!applicationId) {
      setError('Application id is missing.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getInterviewEvaluation(applicationId, roundId);
      applyDetail(data);
    } catch (loadError) {
      setError(getInternalSafeErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [applicationId, applyDetail]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  function selectRound(roundId: string) {
    if (roundId === selectedRoundId) return;
    setSelectedRoundId(roundId);
    void loadDetail(roundId);
  }

  const saveDraft = useCallback(async () => {
    if (!applicationId || !detail || !reviewerSection || !canReview || saving) return;
    setSaving(true);
    const requestRevision = editRevision.current;
    try {
      const nextDetail = await saveInterviewEvaluationReview(
        applicationId,
        detail.currentRound.id,
        reviewerSection,
        { formData, expectedVersion: detail.currentRound.version },
      );
      if (editRevision.current === requestRevision) {
        applyDetail(nextDetail);
      } else {
        setDetail(nextDetail);
        setAggregateData(cloneFormData(nextDetail.currentRound.aggregateData));
        setDirty(true);
      }
    } catch (saveError) {
      setError(getInternalSafeErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }, [applicationId, applyDetail, canReview, detail, formData, reviewerSection, saving]);

  useEffect(() => {
    if (!dirty || !canReview) return undefined;
    const timer = window.setTimeout(() => {
      saveDraft();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [canReview, dirty, formData, saveDraft]);

  function updateFormData(next: InterviewEvaluationFormData) {
    editRevision.current += 1;
    setFormData(next);
    setDirty(true);
  }

  function updateOverall(field: 'result' | 'strengths' | 'concerns' | 'notes', value: string) {
    updateFormData({ ...formData, overall: { ...formData.overall, [field]: value } });
  }

  function updateHrbp(field: HrbpFieldKey, value: string) {
    updateFormData({ ...formData, hrbp: { ...formData.hrbp, [field]: value } });
  }

  function updateCommittee(field: 'technicalRating' | 'problemSolvingRating' | 'communicationRating' | 'teamworkRating' | 'leadershipRating', value: number) {
    updateFormData({ ...formData, committee: { ...formData.committee, [field]: value } });
  }

  async function submitReview() {
    if (!applicationId || !detail || !reviewerSection || !canReview) return;
    setSaving(true);
    try {
      const nextDetail = await submitInterviewEvaluationReview(
        applicationId,
        detail.currentRound.id,
        reviewerSection,
        { formData, expectedVersion: detail.currentRound.version },
      );
      applyDetail(nextDetail);
      toast({ title: 'Đã gửi đánh giá', description: 'Phiếu đánh giá đã được chuyển sang bước tiếp theo.' });
    } catch (submitError) {
      setError(getInternalSafeErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  async function saveAggregation() {
    if (!applicationId || !detail || !isManager) return;
    setSaving(true);
    try {
      const nextDetail = await aggregateInterviewEvaluation(
        applicationId,
        detail.currentRound.id,
        { formData: aggregateData, expectedVersion: detail.currentRound.version },
      );
      applyDetail(nextDetail);
      toast({ title: 'Đã lưu tổng hợp', description: 'HR/HĐCM có thể hoàn tất vòng đánh giá.' });
    } catch (aggregateError) {
      setError(getInternalSafeErrorMessage(aggregateError));
    } finally {
      setSaving(false);
    }
  }

  async function completeRound() {
    if (!applicationId || !detail || !isManager) return;
    setSaving(true);
    try {
      const nextDetail = await completeInterviewEvaluation(applicationId, detail.currentRound.id);
      applyDetail(nextDetail);
      toast({ title: 'Đã hoàn tất vòng', description: 'Vòng đánh giá đã được khóa và lưu lịch sử.' });
    } catch (completeError) {
      setError(getInternalSafeErrorMessage(completeError));
    } finally {
      setSaving(false);
    }
  }

  async function moveToNextRound() {
    if (!applicationId || !detail || !isManager) return;
    setSaving(true);
    try {
      const nextDetail = await createNextInterviewEvaluationRound(applicationId, detail.currentRound.id);
      applyDetail(nextDetail);
      toast({
        title: 'Đã chuyển vòng',
        description: `Tiếp tục đánh giá trên cùng phiếu ${nextDetail.currentRound.name}; dữ liệu trước đó vẫn được giữ nguyên.`,
      });
    } catch (nextError) {
      setError(getInternalSafeErrorMessage(nextError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="rounded-lg border p-6 text-sm text-muted-foreground">Đang tải phiếu đánh giá...</div>;
  if (error && !detail) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="mr-2 h-4 w-4" />Quay lại</Button>
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      </div>
    );
  }
  if (!detail) return null;

  const round = detail.currentRound;
  const committeeForm = formData.committee ?? {};
  const aggregateOverall = aggregateData.overall ?? {};
  const isCommitteeReviewer = reviewerSection === 'COMMITTEE';
  const canViewCommitteeSection = isCommitteeReviewer || isManager;
  const navigationItems = [
    { id: 'overview', label: 'Tổng quan', visible: true },
    { id: 'hrbp', label: 'HRBP', visible: reviewerSection === 'HRBP' || isCommitteeReviewer },
    { id: 'committee', label: 'HĐCM', visible: canViewCommitteeSection },
    { id: 'peer-reviews', label: 'Đánh giá đã gửi', visible: isCommitteeReviewer },
    { id: 'aggregate', label: 'Tổng hợp', visible: isManager },
    { id: 'history', label: 'Lịch sử', visible: true },
  ].filter((item) => item.visible);

  return (
    <div className="min-h-screen space-y-5 bg-slate-50/70 pb-24">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-[#1f3b70] px-6 py-5 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2 text-white hover:bg-white/10 hover:text-white">
                <Link to={`/recruitment/applications/${detail.case.applicationId}`}><ArrowLeft className="mr-2 h-4 w-4" />Quay lại hồ sơ</Link>
              </Button>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">BM04 – QTTĐ</p>
              <h1 className="mt-1 text-xl font-bold uppercase tracking-wide md:text-2xl">Form đánh giá ứng viên sau phỏng vấn</h1>
              <p className="mt-2 text-sm text-blue-100">Phiếu đánh giá vòng {round.name} · {detail.case.template}</p>
            </div>
            <div className="flex flex-col items-start gap-2 text-sm text-blue-100 md:items-end">
              <Badge className={statusClass(round.status)}>{statusLabel(round.status)}</Badge>
              <span className="flex items-center gap-2"><Clock3 className="h-4 w-4" />Phiên bản {round.version} · {saving ? 'Đang lưu...' : dirty ? 'Chưa đồng bộ' : 'Đã lưu'}</span>
            </div>
          </div>
        </div>
        <div className="grid gap-4 bg-white px-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Ứng viên" value={detail.case.candidate.name ?? '-'} />
          <Info label="Email" value={detail.case.candidate.email ?? '-'} />
          <Info label="Điện thoại" value={detail.case.candidate.phone ?? '-'} />
          <Info label="Vị trí / JD" value={detail.case.job.title ?? '-'} />
        </div>
      </div>

      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-sm text-[#1f3b70]">Điều hướng phiếu</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{navigationItems.map((item) => <a key={item.id} className="block rounded px-2 py-1.5 hover:bg-blue-50" href={`#${item.id}`}>{item.label}</a>)}</CardContent></Card>
          <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-sm text-[#1f3b70]">Lịch sử vòng</CardTitle></CardHeader><CardContent className="space-y-2">{detail.rounds.map((item) => <button key={item.id} type="button" aria-pressed={selectedRoundId === item.id} onClick={() => selectRound(item.id)} className={`flex w-full items-center justify-between gap-2 rounded border p-2 text-left text-xs transition-colors ${selectedRoundId === item.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50'}`}><span className="font-medium">{item.name}</span><Badge className={statusClass(item.status)}>{statusLabel(item.status)}</Badge></button>)}</CardContent></Card>
        </aside>

        <main className="space-y-5">
          <Card id="overview" className="border-slate-200 shadow-sm"><CardHeader className="border-b border-slate-200 bg-[#dceaf2]"><CardTitle className="flex items-center gap-2 text-[#1f3b70]"><FileText className="h-4 w-4" />I. Thông tin phiếu đánh giá</CardTitle></CardHeader><CardContent className="grid gap-4 pt-5 md:grid-cols-3"><Info label="Ứng viên" value={detail.case.candidate.name ?? '-'} /><Info label="Email" value={detail.case.candidate.email ?? '-'} /><Info label="Điện thoại" value={detail.case.candidate.phone ?? '-'} /><Info label="Vị trí / JD" value={detail.case.job.title ?? '-'} /><Info label="Mẫu đánh giá" value={detail.case.template} /><Info label="Cập nhật gần nhất" value={formatRecruitmentDateTime(round.completedAt)} /></CardContent></Card>

          {reviewerSection === 'HRBP' ? <Card id="hrbp" className="border-slate-200 shadow-sm"><HrbpSectionHeader readOnly={false} /><CardContent className="pt-5"><div className="overflow-hidden rounded-md border border-slate-200">{HRBP_FIELDS.map((field) => <EditableHrbpRow key={field.key} field={field} value={getHrbpValue(formData.hrbp, field.key) ?? ''} disabled={!canReview} onChange={(value) => updateHrbp(field.key, value)} />)}</div></CardContent></Card> : null}
          {isCommitteeReviewer ? <ReadOnlyHrbpSection data={round.hrbpData} /> : null}

          {reviewerSection === 'COMMITTEE' ? <Card id="committee" className="border-slate-200 shadow-sm"><CardHeader className="border-b border-slate-200 bg-[#dceaf2]"><CardTitle className="flex items-center gap-2 text-[#1f3b70]"><Users className="h-4 w-4" />III. Đánh giá của Hội đồng chuyên môn</CardTitle><p className="text-xs text-slate-600">Đánh giá theo khung năng lực của vị trí và ghi nhận dẫn chứng cụ thể.</p></CardHeader><CardContent className="space-y-4 pt-5"><div className="rounded-md border border-slate-200"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-200 bg-[#2b75b5] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white"><span>Khía cạnh đánh giá</span><span>Mức độ thể hiện</span></div><div className="space-y-1 p-4"><RatingField label="Kiến thức chuyên môn" value={committeeForm.technicalRating} disabled={!canReview} onChange={(value) => updateCommittee('technicalRating', value)} /><RatingField label="Giải quyết vấn đề" value={committeeForm.problemSolvingRating} disabled={!canReview} onChange={(value) => updateCommittee('problemSolvingRating', value)} /><RatingField label="Giao tiếp" value={committeeForm.communicationRating} disabled={!canReview} onChange={(value) => updateCommittee('communicationRating', value)} /><RatingField label="Làm việc nhóm" value={committeeForm.teamworkRating} disabled={!canReview} onChange={(value) => updateCommittee('teamworkRating', value)} /><RatingField label="Leadership / ownership" value={committeeForm.leadershipRating} disabled={!canReview} onChange={(value) => updateCommittee('leadershipRating', value)} /></div></div><TextField label="Đánh giá / dẫn chứng cụ thể của HĐCM" value={committeeForm.notes ?? ''} disabled={!canReview} onChange={(value) => updateFormData({ ...formData, committee: { ...formData.committee, notes: value } })} /></CardContent></Card> : null}
          {!isCommitteeReviewer && isManager ? <ReadOnlyCommitteeSection reviewers={detail.reviewers} /> : null}
          {isCommitteeReviewer ? <ReadOnlyCommitteeReviews reviewers={detail.reviewers} currentUserId={user?.id} /> : null}

          {canReview ? <Card id="overview-form" className="border-slate-200 shadow-sm"><CardHeader className="border-b border-slate-200 bg-[#dceaf2]"><CardTitle className="text-[#1f3b70]">IV. Nhận xét và đề xuất của người đánh giá</CardTitle></CardHeader><CardContent className="space-y-5 pt-5"><SelectField label="Kết quả đề xuất" value={formData.overall?.result ?? 'PENDING'} disabled={!canReview} options={['PENDING', 'PASS', 'FAIL']} onChange={(value) => updateOverall('result', value)} /><div className="grid gap-4 md:grid-cols-2"><TextField label="Điểm mạnh" value={formData.overall?.strengths ?? ''} disabled={!canReview} onChange={(value) => updateOverall('strengths', value)} /><TextField label="Điểm cần làm rõ" value={formData.overall?.concerns ?? ''} disabled={!canReview} onChange={(value) => updateOverall('concerns', value)} /></div><TextField label="Ghi chú" value={formData.overall?.notes ?? ''} disabled={!canReview} onChange={(value) => updateOverall('notes', value)} /></CardContent></Card> : null}

          {isManager ? <Card id="aggregate" className="border-slate-200 shadow-sm"><CardHeader className="border-b border-slate-200 bg-[#dceaf2]"><CardTitle className="flex items-center gap-2 text-[#1f3b70]"><Check className="h-4 w-4" />V. Tổng hợp và quyết định cuối</CardTitle></CardHeader><CardContent className="space-y-5 pt-5"><SelectField label="Kết quả cuối" value={aggregateOverall.result ?? 'PENDING'} disabled={false} options={['PENDING', 'PASS', 'FAIL']} onChange={(value) => setAggregateData({ ...aggregateData, overall: { ...aggregateData.overall, result: value as 'PENDING' | 'PASS' | 'FAIL' } })} /><div className="grid gap-4 md:grid-cols-2"><Field label="Level đề xuất" value={aggregateData.final?.proposedLevel ?? ''} disabled={false} onChange={(value) => setAggregateData({ ...aggregateData, final: { ...aggregateData.final, proposedLevel: value } })} /><Field label="Mức lương đề xuất" value={aggregateData.final?.proposedSalary ?? ''} disabled={false} onChange={(value) => setAggregateData({ ...aggregateData, final: { ...aggregateData.final, proposedSalary: value } })} /></div><TextField label="Bước tiếp theo" value={aggregateData.final?.nextAction ?? ''} disabled={false} onChange={(value) => setAggregateData({ ...aggregateData, final: { ...aggregateData.final, nextAction: value } })} /><TextField label="Ghi chú tổng hợp" value={aggregateData.final?.notes ?? ''} disabled={false} onChange={(value) => setAggregateData({ ...aggregateData, final: { ...aggregateData.final, notes: value } })} /><Separator /><p className="text-sm text-muted-foreground">Chỉ HR/Admin có quyền xem và lưu phần tổng hợp. Điểm của từng thành viên HĐCM không được hiển thị cho thành viên khác.</p></CardContent></Card> : null}

          <Card id="history" className="border-slate-200 shadow-sm"><CardHeader className="border-b border-slate-200 bg-[#dceaf2]"><CardTitle className="flex items-center gap-2 text-[#1f3b70]"><Clock3 className="h-4 w-4" />VI. Lịch sử thao tác</CardTitle></CardHeader><CardContent className="space-y-3 pt-5">{detail.audits.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có lịch sử.</p> : detail.audits.map((audit) => <div key={audit.id} className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3 text-sm last:border-0"><div><p className="font-medium">{audit.action}</p><p className="text-xs text-muted-foreground">{audit.fromStatus ?? '-'} → {audit.toStatus ?? '-'}</p></div><span className="text-xs text-muted-foreground">{formatRecruitmentDateTime(audit.createdAt)}</span></div>)}</CardContent></Card>
        </main>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgba(15,23,42,0.08)] backdrop-blur"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-2"><span className="mr-auto text-xs font-medium text-slate-600">{currentReviewer ? `${sectionLabel(currentReviewer.section)} · ${currentReviewer.status}` : 'Chế độ xem'}</span>{canReview ? <><Button type="button" variant="outline" disabled={saving} onClick={saveDraft}><Save className="mr-2 h-4 w-4" />Lưu nháp</Button><Button type="button" disabled={saving} onClick={submitReview}><Send className="mr-2 h-4 w-4" />{reviewerSection === 'HRBP' ? 'Gửi HĐCM' : 'Gửi đánh giá'}</Button></> : null}{isManager ? <Button type="button" variant="outline" disabled={saving} onClick={saveAggregation}>Lưu tổng hợp</Button> : null}{isManager && round.status === 'WAITING_AGGREGATION' ? <Button type="button" disabled={saving} onClick={completeRound}><LockKeyhole className="mr-2 h-4 w-4" />Hoàn tất</Button> : null}{isManager && round.status === 'COMPLETED' && round.nextRoundKey ? <Button type="button" disabled={saving} onClick={moveToNextRound}>Chuyển vòng {round.nextRoundKey}</Button> : null}</div></div>
    </div>
  );
}

function Info({ label, value }: Readonly<{ label: string; value: string }>) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value}</p></div>;
}

function Field({ label, value, disabled, onChange }: Readonly<{ label: string; value: string; disabled: boolean; onChange: (value: string) => void }>) {
  return <label className="space-y-2"><span className="text-sm font-medium">{label}</span><Input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>;
}

function TextField({ label, value, disabled, onChange }: Readonly<{ label: string; value: string; disabled: boolean; onChange: (value: string) => void }>) {
  return <label className="block space-y-2"><span className="text-sm font-medium">{label}</span><Textarea value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SelectField({ label, value, options, disabled, onChange }: Readonly<{ label: string; value: string; options: readonly string[]; disabled: boolean; onChange: (value: string) => void }>) {
  return <label className="block space-y-2"><span className="text-sm font-medium">{label}</span><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function RatingField({ label, value, disabled, onChange }: Readonly<{ label: string; value?: number; disabled: boolean; onChange: (value: number) => void }>) {
  return <div className="space-y-2"><div className="flex items-center justify-between"><span className="text-sm font-medium">{label}</span><span className="text-xs text-muted-foreground">{value || '-'} / 5</span></div><div className={disabled ? 'opacity-60' : ''}><RatingScale value={value} disabled={disabled} onChange={onChange} /></div></div>;
}
