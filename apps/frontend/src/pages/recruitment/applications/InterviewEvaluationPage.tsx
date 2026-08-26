import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import {
  UserRole,
  type InterviewEvaluationCriterionData,
  type InterviewEvaluationFormData,
} from '@interview-assistant/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getInternalSafeErrorMessage } from '@/lib/api-errors';
import { useAuthContext } from '@/lib/auth-context';
import {
  completeInterviewEvaluation,
  createNextInterviewEvaluationRound,
  getInterviewEvaluation,
  saveInterviewEvaluationReview,
  saveInterviewEvaluationAggregateDraft,
  submitInterviewEvaluationReview,
  type InterviewEvaluationDetail,
} from '@/lib/recruitment-api';
import { formatRecruitmentDateTime } from '@/lib/date-time';
import { closeExtensionTabWithToast, showExtensionToast } from '@/lib/extension-toast-bridge';
import { useNavigate, useParams } from 'react-router-dom';
import './interview-evaluation-page.css';

type CriterionMatrix = 'technicalCompetencies' | 'personalGrowth';
type CriterionRow = InterviewEvaluationCriterionData;
type CriterionDefinition = Readonly<{ key: string; label: string; requirement: string }>;

const EMPTY_FORM: InterviewEvaluationFormData = {
  overall: { result: 'PENDING', strengths: '', concerns: '', notes: '' },
  hrbp: {
    educationCertificates: '', foreignLanguage: '', experienceSummary: '', projectsHighlights: '',
    developmentMotivation: '', onboardingTimeline: '', concerns: '', level: '', placement: '',
    cvSource: '', salaryExpectation: '', noticePeriod: '', motivation: '', notes: '',
  },
  committee: {
    technicalRating: 0, problemSolvingRating: 0, communicationRating: 0, teamworkRating: 0,
    leadershipRating: 0, technicalCompetencies: {}, personalGrowth: {}, notes: '',
  },
  final: { result: 'PENDING', proposedLevel: '', proposedSalary: '', nextAction: '', notes: '', salaryDetails: {} },
};

const HRBP_FIELDS = [
  { key: 'educationCertificates', label: 'Bằng cấp, chứng chỉ' },
  { key: 'foreignLanguage', label: 'Ngoại ngữ' },
  { key: 'experienceSummary', label: 'Tổng quan kỹ năng kinh nghiệm' },
  { key: 'projectsHighlights', label: 'Dự án & kết quả nổi bật' },
  { key: 'developmentMotivation', label: 'Động lực phát triển' },
  { key: 'onboardingTimeline', label: 'Thời gian dự kiến onboard' },
  { key: 'concerns', label: 'Điểm cần lưu ý' },
] as const;

const TECHNICAL_CRITERIA: readonly CriterionDefinition[] = [
  { key: 'knowledge', label: 'Kiến thức chuyên môn (Knowledge)', requirement: '(Theo thông tin của Careerpath đã được ban hành đối với từng level của vị trí)' },
  { key: 'skill', label: 'Kỹ năng chuyên môn (Skill)', requirement: '(Theo thông tin của Careerpath đã được ban hành đối với từng level của vị trí)' },
  { key: 'additionalCompetencies', label: 'Năng lực bổ sung theo đặc thù vị trí/dự án', requirement: 'HM/HĐCM bổ sung theo bối cảnh/yêu cầu đặc thù của dự án, vị trí công việc' },
  { key: 'riskFactors', label: 'Các yếu tố rủi ro', requirement: 'Nêu rõ các rủi ro nếu có (kỹ năng thiếu hụt, gap kinh nghiệm, khác biệt domain...)' },
  { key: 'levelRegion', label: 'Đánh giá Level/Vùng', requirement: 'Đánh giá Level và xếp vùng tương ứng, kèm theo lý do tại cột bên' },
];

const PERSONAL_GROWTH_CRITERIA: readonly CriterionDefinition[] = [
  { key: 'fit', label: 'Sự phù hợp về đặc điểm con người, phong cách làm việc', requirement: 'Ấn tượng tổng thể về tính cách, cá tính, phong cách làm việc của UV? Mức độ phù hợp với đặc thù/tính chất dự án, phong cách làm việc chung của đội nhóm/đơn vị?' },
  { key: 'analysis', label: 'Tư duy phân tích & logic', requirement: 'Khả năng phân tích vấn đề, xác định nguyên nhân gốc rễ, đề xuất giải pháp có cấu trúc, cách làm sáng tạo' },
  { key: 'collaboration', label: 'Khả năng làm việc nhóm & cộng tác', requirement: 'Khả năng hợp tác cross-functional; cách xử lý xung đột / bất đồng trong team' },
  { key: 'adaptability', label: 'Khả năng thích ứng & thúc đẩy kết quả', requirement: 'Hướng kết quả/outcomes, khả năng xử lý rào cản trong thực thi (deadline gấp, yêu cầu thay đổi, yếu tố không chắc chắn…)' },
  { key: 'selfDevelopment', label: 'Khả năng phát triển bản thân', requirement: 'UV có thể hiện sự chủ động học hỏi, cập nhật kiến thức, kỹ năng mới? Dẫn chứng gần nhất?' },
  { key: 'growthPotential', label: 'Động lực & tiềm năng phát triển', requirement: 'UV có tiềm năng đảm nhận scope lớn hơn trong 12–18 tháng tới không? Căn cứ vào đâu? Động lực phát triển của họ là gì?' },
];

const TECHNICAL_LEGEND = [
  { value: 1, label: 'Không đạt', color: 'is-red' },
  { value: 2, label: 'Hiểu / Biết khái niệm cơ bản', color: 'is-orange' },
  { value: 3, label: 'Đã triển khai thực tế & có kinh nghiệm', color: 'is-yellow' },
  { value: 4, label: 'Có khả năng giải quyết vấn đề', color: 'is-light-green' },
  { value: 5, label: 'Hoạch định chiến lược, xây dựng thể chế', color: 'is-green' },
] as const;

const PERSONAL_LEGEND = [
  { value: 1, label: 'Yếu / Không rõ ràng', color: 'is-red' },
  { value: 2, label: 'Thể hiện có hạn', color: 'is-orange' },
  { value: 3, label: 'Thể hiện rõ ràng', color: 'is-yellow' },
  { value: 4, label: 'Thể hiện mạnh mẽ, mang giá trị nền', color: 'is-light-green' },
  { value: 5, label: 'Truyền cảm hứng, có tác động và tầm ảnh hưởng', color: 'is-green' },
] as const;

const TECHNICAL_ROW_COUNTS: Readonly<Record<string, number>> = {
  knowledge: 4,
  skill: 4,
  additionalCompetencies: 4,
  riskFactors: 1,
  levelRegion: 1,
};

const SALARY_FIELDS = [
  { key: 'contract', label: 'Diện ký hợp đồng' },
  { key: 'rule', label: 'Lương_Rule' },
  { key: 'comparison', label: 'Mức lương so sánh' },
  { key: 'desired', label: 'Mức lương mong muốn' },
  { key: 'proposed', label: 'Mức lương đề xuất' },
] as const;

type SalaryFieldKey = (typeof SALARY_FIELDS)[number]['key'];
type SalaryInputPart = 'value' | 'note';

function cloneMatrix(matrix?: Record<string, CriterionRow[]>) {
  return Object.fromEntries(Object.entries(matrix ?? {}).map(([key, rows]) => [key, rows.map((row) => ({ ...row }))]));
}

function cloneFormData(data?: InterviewEvaluationFormData | null): InterviewEvaluationFormData {
  return {
    overall: { ...EMPTY_FORM.overall, ...data?.overall },
    hrbp: { ...EMPTY_FORM.hrbp, ...data?.hrbp },
    committee: {
      ...EMPTY_FORM.committee,
      ...data?.committee,
      technicalCompetencies: cloneMatrix(data?.committee?.technicalCompetencies),
      personalGrowth: cloneMatrix(data?.committee?.personalGrowth),
    },
    final: {
      ...EMPTY_FORM.final,
      ...data?.final,
      salaryDetails: {
        ...EMPTY_FORM.final?.salaryDetails,
        ...data?.final?.salaryDetails,
        notes: { ...EMPTY_FORM.final?.salaryDetails?.notes, ...data?.final?.salaryDetails?.notes },
      },
    },
  };
}

function getHrbpValue(hrbp: InterviewEvaluationFormData['hrbp'], field: string) {
  if (field === 'developmentMotivation') return hrbp?.developmentMotivation || hrbp?.motivation;
  if (field === 'concerns') return hrbp?.concerns || hrbp?.notes;
  return hrbp?.[field as keyof NonNullable<InterviewEvaluationFormData['hrbp']>];
}

function interviewLabel(roundName: string) {
  const match = roundName.match(/(\d+)/);
  if (!match) return roundName || '1st Interview';
  const number = Number(match[1]);
  let suffix = 'th';
  if (number % 100 < 11 || number % 100 > 13) {
    if (number % 10 === 1) suffix = 'st';
    else if (number % 10 === 2) suffix = 'nd';
    else if (number % 10 === 3) suffix = 'rd';
  }
  return `${number}${suffix} Interview`;
}

function formatEvaluationDate(detail: InterviewEvaluationDetail) {
  const source = detail.currentRound.completedAt ?? [...detail.audits].reverse().find((audit) => audit.createdAt)?.createdAt;
  if (!source) return 'dd/mm/yyyy';
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return 'dd/mm/yyyy';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function getTemplateDescription(template: InterviewEvaluationDetail['case']['template']) {
  if (template === 'BM04.2_CAREERPATH') return 'BM04.2: Áp dụng các Vị trí chưa có KNL, đánh giá theo Careerpath';
  return 'BM04.1: Áp dụng theo Khung năng lực (Competency Framework)';
}

function getMatrixRowCount(matrix: CriterionMatrix, criterionKey: string) {
  if (matrix === 'technicalCompetencies') return TECHNICAL_ROW_COUNTS[criterionKey] ?? 1;
  return 1;
}

function formatCandidateSource(source?: string | null, sourceChannel?: string | null) {
  const sourceValue = sourceChannel || source;
  if (!sourceValue) return 'Chưa đồng bộ';
  const labels: Record<string, string> = {
    VCS_PORTAL: 'VCS Portal',
    PORTAL: 'VCS Portal',
    FACEBOOK: 'Facebook',
    TOPCV: 'TopCV',
    ITVIEC: 'ITviec',
    VIETNAMWORKS: 'VietnamWorks',
    LINKEDIN: 'LinkedIn',
    MANUAL: 'Nhập thủ công',
    OTHER: 'Khác',
  };
  return labels[sourceValue.toUpperCase()] ?? sourceValue;
}

function getHistoryLabel(action: string) {
  const labels: Record<string, string> = { CASE_CREATED: 'Khởi tạo đánh giá', ROUND_CREATED: 'Khởi tạo vòng đánh giá', REVIEW_SAVED: 'Lưu nháp đánh giá', REVIEW_SUBMITTED: 'Hoàn thành đánh giá', AGGREGATION_DRAFT_SAVED: 'Lưu nháp tổng hợp', AGGREGATION_SAVED: 'Lưu tổng hợp', ROUND_COMPLETED: 'Hoàn thành vòng phỏng vấn', NEXT_ROUND_CREATED: 'Tạo vòng phỏng vấn tiếp theo', ROUND_CONTEXT_SYNCHRONIZED: 'Đồng bộ dữ liệu vòng phỏng vấn' };
  return labels[action] ?? action;
}

function findCurrentReviewer(detail: InterviewEvaluationDetail | null, userId?: string) {
  if (!detail || !userId) return undefined;
  return detail.reviewers.find((reviewer) => reviewer.userId === userId);
}

function SectionHeader({ title, tone }: Readonly<{ title: string; tone: 'blue' | 'green' | 'committee' }>) {
  return <div className={`evaluation-section-header is-${tone}`}>{title}</div>;
}

function DesignInfoRow({ label, value, placeholder = 'Chưa nhập' }: Readonly<{ label: string; value?: string | null; placeholder?: string }>) {
  return <tr><th scope="row">{label}</th><td className={value ? undefined : 'evaluation-empty-value'}>{value || placeholder}</td></tr>;
}

function EditableInfoRow({ label, value, placeholder, disabled, onChange }: Readonly<{ label: string; value: string; placeholder: string; disabled: boolean; onChange: (value: string) => void }>) {
  const controlId = `overview-${label.toLowerCase().replaceAll(' ', '-')}`;
  return <tr><th scope="row"><label htmlFor={controlId}>{label}</label></th><td><Input id={controlId} className="evaluation-design-field" value={value} placeholder={placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></td></tr>;
}

function InfoGroupRow({ label, description }: Readonly<{ label: string; description: string }>) {
  return <tr className="evaluation-info-group"><th scope="row">{label}</th><td>{description}</td></tr>;
}

function EditableHrbpRow({ label, value, disabled, onChange }: Readonly<{ label: string; value: string; disabled: boolean; onChange: (value: string) => void }>) {
  const controlId = `hrbp-${label.toLowerCase().replaceAll(' ', '-')}`;
  return <tr><th scope="row"><label htmlFor={controlId}>{label}</label></th><td><Textarea id={controlId} className="evaluation-design-field" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></td></tr>;
}

function ReadOnlyHrbpRow({ label, value }: Readonly<{ label: string; value?: string | null }>) {
  return <tr><th scope="row">{label}</th><td className={value ? undefined : 'evaluation-empty-value'}>{value || 'Chưa nhập'}</td></tr>;
}

function RatingLegend({ entries }: Readonly<{ entries: readonly { value: number; label: string; color: string }[] }>) {
  return <div className="evaluation-rating-legend" aria-label="Thang đánh giá mức độ thể hiện">{entries.map((entry) => <div className="evaluation-rating-legend-item" key={entry.value}><span className={`evaluation-rating-legend-swatch ${entry.color}`}>{entry.value}</span><span>{entry.label}</span></div>)}</div>;
}

function MatrixCellInput({ value, disabled, multiline, ariaLabel, placeholder, onChange }: Readonly<{ value: string; disabled: boolean; multiline?: boolean; ariaLabel: string; placeholder?: string; onChange: (value: string) => void }>) {
  if (disabled) return <div className="evaluation-matrix-readonly" aria-label={ariaLabel}>{value}</div>;
  if (multiline) return <Textarea aria-label={ariaLabel} className="evaluation-matrix-field" placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />;
  return <Input aria-label={ariaLabel} className="evaluation-matrix-field" placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />;
}

function CommitteeMatrix({ matrix, criteria, legend, disabled, values, onChange }: Readonly<{ matrix: CriterionMatrix; criteria: readonly CriterionDefinition[]; legend: readonly { value: number; label: string; color: string }[]; disabled: boolean; values: Record<string, CriterionRow[]>; onChange: (key: string, rowIndex: number, patch: Partial<CriterionRow>) => void }>) {
  const requirementHeaderDescription = matrix === 'technicalCompetencies'
    ? '(Theo thông tin của Careerpath đã được ban hành đối với từng level của vị trí)'
    : null;
  return <>
    <div className="evaluation-matrix-help">Thang đánh giá mức độ thể hiện:</div>
    <RatingLegend entries={legend} />
    <div className="evaluation-matrix-scroll"><table className="evaluation-matrix-table"><colgroup><col className="evaluation-matrix-index" /><col className="evaluation-matrix-criterion" /><col className="evaluation-matrix-requirement" /><col className="evaluation-matrix-evidence" />{legend.map((entry) => <col className={`evaluation-rating-cell evaluation-rating-cell-${entry.value}`} key={entry.value} />)}<col className="evaluation-matrix-note" /></colgroup><thead><tr><th rowSpan={2}>STT</th><th rowSpan={2}>{matrix === 'technicalCompetencies' ? 'KHÍA CẠNH ĐÁNH GIÁ' : 'TIÊU CHÍ ĐÁNH GIÁ'}</th><th rowSpan={2} className="evaluation-requirement-header"><span>YÊU CẦU</span>{requirementHeaderDescription ? <span className="evaluation-requirement-header-description">{requirementHeaderDescription}</span> : null}</th><th rowSpan={2}>ĐÁNH GIÁ / DẪN CHỨNG CỤ THỂ</th><th colSpan={5}>ĐÁNH GIÁ MỨC ĐỘ THỂ HIỆN</th><th rowSpan={2}>GHI CHÚ</th></tr><tr>{legend.map((entry) => <th className={`evaluation-rating-header ${entry.color}`} key={entry.value}>{entry.value}</th>)}</tr></thead><tbody>{criteria.map((criterion, criterionIndex) => { const rowCount = getMatrixRowCount(matrix, criterion.key); const rows = values[criterion.key] ?? []; return Array.from({ length: rowCount }, (_, rowIndex) => { const row = rows[rowIndex] ?? {}; const rowKey = `${criterion.key}-${rowIndex}`; return <tr key={rowKey}>{rowIndex === 0 ? <><td rowSpan={rowCount} className="evaluation-matrix-index">{criterionIndex + 1}</td><td rowSpan={rowCount} className="evaluation-matrix-criterion">{criterion.label}</td><td rowSpan={rowCount} className="evaluation-matrix-requirement">{criterion.requirement}</td></> : null}<td><MatrixCellInput value={row.evidence ?? ''} disabled={disabled} multiline ariaLabel={`${criterion.label} dẫn chứng ${rowIndex + 1}`} onChange={(value) => onChange(criterion.key, rowIndex, { evidence: value })} /></td>{legend.map((entry) => <td className="evaluation-rating-cell" key={entry.value}><input type="radio" name={`${matrix}-${criterion.key}-${rowIndex}`} value={entry.value} checked={row.rating === entry.value} disabled={disabled} aria-label={`${criterion.label}: mức ${entry.value}`} onChange={() => onChange(criterion.key, rowIndex, { rating: entry.value })} /></td>)}<td><MatrixCellInput value={row.note ?? ''} disabled={disabled} ariaLabel={`${criterion.label} ghi chú ${rowIndex + 1}`} placeholder="Ghi chú" onChange={(value) => onChange(criterion.key, rowIndex, { note: value })} /></td></tr>; }); })}</tbody></table></div>
  </>;
}

function SalaryProposalSection({ data, disabled, onChange }: Readonly<{ data: InterviewEvaluationFormData; disabled: boolean; onChange: (field: SalaryFieldKey, part: SalaryInputPart, value: string) => void }>) {
  const salaryDetails = data.final?.salaryDetails ?? {};
  return <section id="salary" className="evaluation-design-block evaluation-salary-section">
    <div className="evaluation-salary-header"><span>Đề Xuất Lương</span><span>(Mục này điền sau phỏng vấn final)</span></div>
    <table className="evaluation-salary-table"><colgroup><col className="evaluation-salary-content" /><col className="evaluation-salary-value" /><col className="evaluation-salary-note-column" /></colgroup><thead><tr><th scope="col">Nội dung</th><th scope="col">Giá trị (Gross)</th><th scope="col">Ghi chú</th></tr></thead><tbody>{SALARY_FIELDS.map((field) => {
      const value = field.key === 'proposed' ? data.final?.proposedSalary ?? '' : salaryDetails[field.key] ?? '';
      const note = salaryDetails.notes?.[field.key] ?? '';
      return <tr key={field.key}><th scope="row"><label htmlFor={`salary-${field.key}`}>{field.label}</label></th><td><Input id={`salary-${field.key}`} className="evaluation-salary-field" value={value} placeholder="VD: 30,000,000" disabled={disabled} onChange={(event) => onChange(field.key, 'value', event.target.value)} /></td><td><Input id={`salary-${field.key}-note`} className="evaluation-salary-field" value={note} placeholder="Ghi chú..." disabled={disabled} onChange={(event) => onChange(field.key, 'note', event.target.value)} /></td></tr>;
    })}</tbody></table>
  </section>;
}

export function InterviewEvaluationPage() {
  const { applicationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [detail, setDetail] = useState<InterviewEvaluationDetail | null>(null);
  const [formData, setFormData] = useState<InterviewEvaluationFormData>(cloneFormData());
  const [aggregateData, setAggregateData] = useState<InterviewEvaluationFormData>(cloneFormData());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editRevision = useRef(0);
  const draftSaveRef = useRef<Promise<boolean> | null>(null);

  const currentReviewer = useMemo(() => findCurrentReviewer(detail, user?.id), [detail, user?.id]);
  const reviewerSection = currentReviewer?.section;
  const isManager = user?.role === UserRole.ADMIN || user?.role === UserRole.HR;
  const isCommitteeUser = user?.role === UserRole.COMMITTEE;
  const isCommitteeReviewer = reviewerSection === 'COMMITTEE' && isCommitteeUser;
  const canReview = Boolean(
    currentReviewer
      && detail?.permissions.canReview
      && ((reviewerSection === 'HRBP' && isManager)
        || (reviewerSection === 'COMMITTEE' && isCommitteeUser)),
  );
  const canViewCommittee = isCommitteeReviewer || isManager;
  const canEditCommittee = isCommitteeReviewer && canReview;

  const applyDetail = useCallback((nextDetail: InterviewEvaluationDetail) => {
    setDetail(nextDetail);
    const reviewer = findCurrentReviewer(nextDetail, user?.id);
    const reviewerFormData = cloneFormData(reviewer?.formData);
    if (reviewer?.section === 'COMMITTEE') {
      const sharedCommitteeData = cloneFormData(nextDetail.currentRound.committeeData);
      setFormData({ ...reviewerFormData, committee: { ...sharedCommitteeData.committee, ...(reviewer.formData?.committee ?? {}), technicalCompetencies: { ...sharedCommitteeData.committee?.technicalCompetencies, ...reviewer.formData?.committee?.technicalCompetencies }, personalGrowth: { ...sharedCommitteeData.committee?.personalGrowth, ...reviewer.formData?.committee?.personalGrowth } } });
    } else {
      const hrbpFormData = cloneFormData(reviewer?.formData ?? nextDetail.currentRound.hrbpData);
      const savedCvSource = hrbpFormData.hrbp?.cvSource?.trim();
      const cvSource = savedCvSource || formatCandidateSource(nextDetail.case.source, nextDetail.case.sourceChannel);
      setFormData({ ...hrbpFormData, hrbp: { ...hrbpFormData.hrbp, cvSource } });
    }
    setAggregateData(cloneFormData(nextDetail.currentRound.aggregateData));
    setDirty(false);
  }, [user?.id]);

  const loadDetail = useCallback(async () => {
    if (!applicationId) { setError('Application id is missing.'); setLoading(false); return; }
    setLoading(true); setError(null);
    try { applyDetail(await getInterviewEvaluation(applicationId)); } catch (loadError) { setError(getInternalSafeErrorMessage(loadError)); } finally { setLoading(false); }
  }, [applicationId, applyDetail]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  function updateFormData(next: InterviewEvaluationFormData) { editRevision.current += 1; setFormData(next); setDirty(true); }
  function updateHrbp(field: string, value: string) {
    if (!isManager || reviewerSection !== 'HRBP' || !canReview) return;
    updateFormData({ ...formData, hrbp: { ...formData.hrbp, [field]: value } });
  }
  function updateCommitteeMatrix(matrix: CriterionMatrix, key: string, rowIndex: number, patch: Partial<CriterionRow>) {
    const currentMatrix = formData.committee?.[matrix] ?? {};
    const nextRows = [...(currentMatrix[key] ?? [])];
    nextRows[rowIndex] = { ...nextRows[rowIndex], ...patch };
    updateFormData({ ...formData, committee: { ...formData.committee, [matrix]: { ...currentMatrix, [key]: nextRows } } });
  }

  function updateOverviewField(field: 'level' | 'cvSource', value: string) {
    if (!isManager || reviewerSection !== 'HRBP' || !canReview) return;
    updateFormData({ ...formData, hrbp: { ...formData.hrbp, [field]: value } });
  }

  function updateSalary(field: SalaryFieldKey, part: SalaryInputPart, value: string) {
    if (!isManager) return;
    const updateFinal = (data: InterviewEvaluationFormData) => {
      if (part === 'value' && field === 'proposed') return { ...data, final: { ...data.final, proposedSalary: value } };
      return {
        ...data,
        final: {
          ...data.final,
          salaryDetails: part === 'value'
            ? { ...data.final?.salaryDetails, [field]: value }
            : { ...data.final?.salaryDetails, notes: { ...data.final?.salaryDetails?.notes, [field]: value } },
        },
      };
    };
    if (canReview) {
      updateFormData(updateFinal(formData));
      return;
    }
    editRevision.current += 1;
    setAggregateData(updateFinal(aggregateData));
    setDirty(true);
  }

  const saveDraft = useCallback(async (showToast = false) => {
    if (!applicationId || !detail) return false;
    const shouldSaveReviewer = Boolean(reviewerSection && canReview);
    const shouldSaveAggregate = !shouldSaveReviewer && isManager;
    if (!shouldSaveReviewer && !shouldSaveAggregate) return false;

    if (draftSaveRef.current) {
      const saved = await draftSaveRef.current;
      if (showToast && saved) showExtensionToast('SUCCESS', 'Đã lưu nháp form đánh giá');
      return saved;
    }

    const requestRevision = editRevision.current;
    const requestFormData = shouldSaveReviewer ? formData : aggregateData;
    const request = (async () => {
      setSaving(true);
      try {
        let nextDetail: InterviewEvaluationDetail;
        if (shouldSaveReviewer && reviewerSection) {
          nextDetail = await saveInterviewEvaluationReview(applicationId, detail.currentRound.id, reviewerSection, { formData: requestFormData, expectedVersion: detail.currentRound.version });
        } else {
          nextDetail = await saveInterviewEvaluationAggregateDraft(applicationId, detail.currentRound.id, { formData: requestFormData, expectedVersion: detail.currentRound.version });
        }
        if (editRevision.current === requestRevision) applyDetail(nextDetail);
        else { setDetail(nextDetail); setDirty(true); }
        return true;
      } catch (saveError) {
        setError(getInternalSafeErrorMessage(saveError));
        return false;
      } finally {
        setSaving(false);
        draftSaveRef.current = null;
      }
    })();
    draftSaveRef.current = request;
    const saved = await request;
    if (showToast && saved) showExtensionToast('SUCCESS', 'Đã lưu nháp form đánh giá');
    return saved;
  }, [aggregateData, applicationId, applyDetail, canReview, detail, formData, isManager, reviewerSection]);

  useEffect(() => {
    if (!dirty || (!canReview && !isManager)) return undefined;
    const timer = window.setTimeout(() => { saveDraft(); }, 1200);
    return () => window.clearTimeout(timer);
  }, [aggregateData, canReview, dirty, formData, isManager, saveDraft]);

  async function saveAllDraft() {
    if (!applicationId || !detail || saving) return;
    await saveDraft(true);
  }

  async function submitReview() {
    if (!applicationId || !detail || !reviewerSection || !canReview) return;
    setSaving(true);
    try { applyDetail(await submitInterviewEvaluationReview(applicationId, detail.currentRound.id, reviewerSection, { formData, expectedVersion: detail.currentRound.version })); showExtensionToast('SUCCESS', 'Đã hoàn thành form đánh giá'); } catch (submitError) { setError(getInternalSafeErrorMessage(submitError)); } finally { setSaving(false); }
  }
  async function completeRound() {
    if (!applicationId || !detail || !isManager) return;
    if (dirty && !await saveDraft()) return;
    setSaving(true);
    try { applyDetail(await completeInterviewEvaluation(applicationId, detail.currentRound.id)); showExtensionToast('SUCCESS', 'Đã hoàn thành form đánh giá'); } catch (completeError) { setError(getInternalSafeErrorMessage(completeError)); } finally { setSaving(false); }
  }
  async function completeCurrentReview() {
    if (isCommitteeReviewer || (canReview && currentReviewer?.status !== 'SUBMITTED')) {
      await submitReview();
      return;
    }
    await completeRound();
  }
  async function moveToNextRound() {
    if (!applicationId || !detail || !isManager) return;
    setSaving(true);
    try { applyDetail(await createNextInterviewEvaluationRound(applicationId, detail.currentRound.id)); showExtensionToast('SUCCESS', 'Tiếp tục đánh giá trên cùng phiếu; dữ liệu trước đó vẫn được giữ nguyên.', 'Đã chuyển vòng'); } catch (nextError) { setError(getInternalSafeErrorMessage(nextError)); } finally { setSaving(false); }
  }

  async function cancelEditing() {
    if (saving) return;
    if (dirty && !await saveDraft()) return;
    closeExtensionTabWithToast({
      kind: 'SUCCESS',
      message: 'Đã hủy chỉnh sửa form. Và hệ thống đã lưu thay đổi vào Lưu nháp.',
    });
  }

  if (loading) return <div className="evaluation-loading">Đang tải phiếu đánh giá...</div>;
  if (error && !detail) return <div className="evaluation-error-page"><p>{error}</p><Button type="button" onClick={() => navigate(-1)}>Quay lại</Button></div>;
  if (!detail) return null;

  const round = detail.currentRound;
  const currentInterviewLabel = interviewLabel(round.name);
  const hrbpReviewer = detail.reviewers.find((reviewer) => reviewer.section === 'HRBP');
  const committeeReviewerNames = detail.reviewers.filter((reviewer) => reviewer.section === 'COMMITTEE').map((reviewer) => reviewer.name).join(', ');
  const reviewerNames = committeeReviewerNames || 'Chưa phân công';
  const hrbpData = round.hrbpData ?? {};
  const committeeData = round.committeeData ?? {};
  const canEditOverview = isManager && canReview && reviewerSection === 'HRBP';
  const overviewHrbpData = canEditOverview ? formData.hrbp : hrbpData.hrbp ?? formData.hrbp;
  const defaultCvSource = formatCandidateSource(detail.case.source, detail.case.sourceChannel);
  const overviewCvSource = overviewHrbpData?.cvSource || defaultCvSource;
  const technicalValues = (isCommitteeReviewer ? formData.committee?.technicalCompetencies : committeeData.committee?.technicalCompetencies) ?? {};
  const personalValues = (isCommitteeReviewer ? formData.committee?.personalGrowth : committeeData.committee?.personalGrowth) ?? {};
  let salaryData = aggregateData;
  if (isCommitteeReviewer) salaryData = cloneFormData({ final: { ...aggregateData.final, ...hrbpData.final } });
  else if (canReview) salaryData = formData;
  let canComplete = false;
  if (isCommitteeReviewer) canComplete = canReview && currentReviewer?.status !== 'SUBMITTED';
  else if (canReview && currentReviewer?.status !== 'SUBMITTED') canComplete = true;
  else canComplete = isManager && round.status === 'WAITING_AGGREGATION';
  const canAccessCompletion = isCommitteeReviewer || isManager;

  return <div className="evaluation-page"><div className="evaluation-shell">
    <header className="evaluation-titlebar"><h1>Form Đánh Giá Ứng Viên Sau Phỏng Vấn {currentInterviewLabel}</h1></header>
    <div className="evaluation-subbar"><div className="evaluation-subbar-label">Đánh giá sau {currentInterviewLabel}</div><div className="evaluation-interview-date"><span>Ngày phỏng vấn:</span><span className="evaluation-date-value"><CalendarDays aria-hidden="true" />{formatEvaluationDate(detail)}</span></div><div className="evaluation-template-note">{getTemplateDescription(detail.case.template)}</div></div>
    {error ? <div className="evaluation-error">{error}</div> : null}
    <div className="evaluation-layout">
   <aside className="evaluation-sidebar" aria-label="Điều hướng phiếu đánh giá"><div className="evaluation-sidebar-card"><h2 className="evaluation-sidebar-title">Điều hướng phiếu</h2><nav className="evaluation-navigation"><a href="#overview">I. Thông tin ứng viên</a><a href="#hrbp">II. Đánh giá từ HRBP</a><a href="#committee">III. Đánh giá HĐCM</a><div className="evaluation-navigation-subitems"><a href="#technical">III.1 Năng lực chuyên môn</a><a href="#personal-growth">III.2 Nhận diện con người &amp; Tiềm năng phát triển</a></div></nav></div><div className="evaluation-sidebar-card evaluation-history-card"><h2 className="evaluation-sidebar-title">Lịch sử chỉnh sửa</h2><div className="evaluation-history-content"><div className="evaluation-history">{detail.audits.length === 0 ? <span className="evaluation-empty-value">Chưa có lịch sử.</span> : detail.audits.map((audit) => <div className="evaluation-history-item" key={audit.id}><time className="evaluation-history-timestamp" dateTime={audit.createdAt}>{formatRecruitmentDateTime(audit.createdAt)}</time><span className="evaluation-history-action">{getHistoryLabel(audit.action)}</span></div>)}</div><span className="evaluation-history-scroll-indicator" aria-hidden="true" /></div></div></aside>
      <main className="evaluation-main">
        <section id="overview" className="evaluation-design-block"><SectionHeader title="I. Thông tin ứng viên" tone="blue" /><table className="evaluation-info-table"><tbody><DesignInfoRow label="Họ tên ứng viên" value={detail.case.candidate.name} /><DesignInfoRow label="Năm sinh" placeholder="VD: 1995" /><DesignInfoRow label="Vị trí ứng tuyển" value={detail.case.job.title} placeholder="Tên vị trí..." /><InfoGroupRow label="Dự kiến sắp xếp công việc" description="Sau 1st interview, HRBP tóm tắt các thông tin chính về phương án sắp xếp công việc trong trường hợp offer ứng viên" /><DesignInfoRow label="- Đơn vị (N-1)" /><DesignInfoRow label="- Bộ phận/Dự án (N-2)" /><DesignInfoRow label="- Mảng việc chuyên hướng" /><DesignInfoRow label="- Chân dung yêu cầu" /><DesignInfoRow label="- Lý do tuyển dụng" /><InfoGroupRow label="Tổng quan đánh giá" description="Dựa trên đánh giá 1st interview, HRBP cập nhật thông tin về xếp loại Level/Vùng dự kiến và mức độ tài năng/tiềm năng của ứng viên so với chân dung vị trí" />{canEditOverview ? <EditableInfoRow label="Xếp loại Level – Vùng – Loại" value={overviewHrbpData?.level ?? ''} placeholder="VD: Level 3 – Vùng B – Loại 2" disabled={!canEditOverview} onChange={(value) => updateOverviewField('level', value)} /> : <DesignInfoRow label="Xếp loại Level – Vùng – Loại" value={overviewHrbpData?.level} placeholder="VD: Level 3 – Vùng B – Loại 2" />}{canEditOverview ? <EditableInfoRow label="Nguồn CV" value={overviewCvSource} placeholder="LinkedIn / Referral / JD..." disabled={!canEditOverview} onChange={(value) => updateOverviewField('cvSource', value)} /> : <DesignInfoRow label="Nguồn CV" value={overviewCvSource} placeholder="LinkedIn / Referral / JD..." />}<DesignInfoRow label="HRBP phụ trách" value={hrbpReviewer?.name} placeholder="Họ tên HRBP..." /><DesignInfoRow label="Người đánh giá (HM/HDCM)" value={reviewerNames} placeholder="Họ tên người đánh giá..." /></tbody></table></section>
        <SalaryProposalSection data={salaryData} disabled={!isManager} onChange={updateSalary} />
        <section id="hrbp" className="evaluation-design-block"><SectionHeader title="II. Đánh giá từ HRBP phụ trách" tone="green" /><div className="evaluation-section-description">Mục này do HRBP hoàn thiện trước buổi phỏng vấn chuyên môn, dựa trên hồ sơ CV, kết quả phone screening và quan sát trong quá trình tiếp xúc. Đây là sở cứ quan trọng để HM/HĐCM và BGĐ đánh giá toàn diện ứng viên.</div><table className="evaluation-edit-table"><tbody>{HRBP_FIELDS.map((field) => !isManager || isCommitteeReviewer ? <ReadOnlyHrbpRow key={field.key} label={field.label} value={`${getHrbpValue(hrbpData.hrbp, field.key) ?? ''}`} /> : <EditableHrbpRow key={field.key} label={field.label} value={`${getHrbpValue(formData.hrbp, field.key) ?? ''}`} disabled={!canReview} onChange={(value) => updateHrbp(field.key, value)} />)}</tbody></table></section>
        {canViewCommittee ? <section id="committee" className="evaluation-design-block evaluation-committee-section"><SectionHeader title="III. Đánh giá của Hội Đồng Chuyên Môn" tone="committee" /><div className="evaluation-section-description committee-description">Mục này do Hội đồng chuyên môn hoàn thiện trong và sau buổi phỏng vấn. Đánh giá theo Khung năng lực (Competency Framework) đã ban hành cho từng vị trí. Với vị trí chưa có KNL, HDCM đánh giá theo thông tin của Careerpath đã được ban hành đối với từng level tương ứng.</div><div id="technical" className="evaluation-matrix-section"><div className="evaluation-matrix-title">III.1 Năng lực chuyên môn <span>(Functional Competencies – theo Khung Năng lực)</span></div><div className="evaluation-matrix-content"><CommitteeMatrix matrix="technicalCompetencies" criteria={TECHNICAL_CRITERIA} legend={TECHNICAL_LEGEND} disabled={!canEditCommittee} values={technicalValues} onChange={(key, rowIndex, patch) => updateCommitteeMatrix('technicalCompetencies', key, rowIndex, patch)} /></div></div><div id="personal-growth" className="evaluation-matrix-section"><div className="evaluation-matrix-title">III.2 Nhận diện con người &amp; Tiềm năng phát triển (Personal &amp; Growth Potential)</div><div className="evaluation-matrix-content"><CommitteeMatrix matrix="personalGrowth" criteria={PERSONAL_GROWTH_CRITERIA} legend={PERSONAL_LEGEND} disabled={!canEditCommittee} values={personalValues} onChange={(key, rowIndex, patch) => updateCommitteeMatrix('personalGrowth', key, rowIndex, patch)} /></div></div><div className="evaluation-committee-comment"><div className="evaluation-committee-comment-title">Nhận xét tổng quan của HĐCM</div><Textarea className="evaluation-comment-field" value={isCommitteeReviewer ? formData.committee?.notes ?? '' : committeeData.committee?.notes ?? ''} disabled={!canEditCommittee} placeholder="Nhập nhận xét..." onChange={(event) => updateFormData({ ...formData, committee: { ...formData.committee, notes: event.target.value } })} /></div></section> : null}
      </main>
    </div>
    <footer className="evaluation-footer"><Button type="button" className="evaluation-footer-cancel" disabled={saving} onClick={cancelEditing}>Hủy</Button>{canReview || isManager ? <Button type="button" className="evaluation-footer-draft" disabled={saving} onClick={saveAllDraft}>Lưu nháp</Button> : null}{canAccessCompletion ? <Button type="button" className="evaluation-footer-complete" disabled={saving || !canComplete} onClick={completeCurrentReview}>Hoàn thành</Button> : null}{isManager && round.status === 'COMPLETED' && round.nextRoundKey ? <Button type="button" className="evaluation-footer-next" disabled={saving} onClick={moveToNextRound}>Chuyển vòng {round.nextRoundKey}</Button> : null}</footer>
  </div></div>;
}
