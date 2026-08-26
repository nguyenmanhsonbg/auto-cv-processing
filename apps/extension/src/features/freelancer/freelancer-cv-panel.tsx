import { useEffect, useMemo, useState } from 'react';
import {
  ApiClientError,
  changePassword,
  getFreelancerSummary,
  listFreelancerApplications,
  updateFreelancerApplicationEvaluation,
} from '@/lib/api-client';
import { StatsMetricGrid } from '@/components/metrics/StatsMetricGrid';
import { CandidateAvatar } from '@/components/candidates/CandidateAvatar';
import { AppliedDateIcon, JobDescriptionIcon, SaveNoteIcon } from '@/components/icons';
import { ChangePasswordForm } from '@/features/auth/ChangePasswordForm';
import { FreelancerCvFilters } from './components/FreelancerCvFilters';
import type { FreelancerCvFilterValues } from './components/FreelancerCvFilters';
import {
  buildFreelancerCvPaginationPages,
  buildFreelancerCvStatusOptions,
  isFreelancerCvFormSent,
  matchesFreelancerCvStatus,
} from './freelancer-cv-filter-utils';
import type {
  AmisRecruitmentRound,
  ApiPagination,
  FreelancerSelfApplication,
  FreelancerSelfSummary,
} from '@/types/types';

type RecruitmentRoundLoadTarget = {
  jobPostingId: string;
  amisRecruitmentId: string;
};

type RecruitmentRoundLoadResult = RecruitmentRoundLoadTarget & {
  rounds: AmisRecruitmentRound[];
};

type FreelancerCvPanelProps = {
  accessToken: string;
  onNotify?: (kind: 'SUCCESS' | 'ERROR', title: string, message: string) => void;
  loadRecruitmentRounds?: (
    targets: RecruitmentRoundLoadTarget[],
  ) => Promise<RecruitmentRoundLoadResult[]>;
  isChangePasswordFormOpen?: boolean;
  onCloseChangePassword?: () => void;
  onPasswordChanged?: () => void;
};

type StatusCategory = 'PROCESSING' | 'PASSED' | 'REJECTED';

const FREELANCER_CV_PAGE_SIZE = 5;

const STATUS_LABELS: Record<StatusCategory, string> = {
  PROCESSING: 'Đang xử lý',
  PASSED: 'Đã đậu',
  REJECTED: 'Bị loại',
};

async function loadAllFreelancerApplicationsForCatalog(
  accessToken: string,
  query: string,
): Promise<FreelancerSelfApplication[]> {
  const firstPage = await listFreelancerApplications(accessToken, {
    page: 1,
    limit: 100,
    search: query,
    sortOrder: 'DESC',
  });

  const totalPages = firstPage.pagination?.totalPages ?? 1;
  if (totalPages <= 1) return firstPage.data;

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => listFreelancerApplications(accessToken, {
      page: index + 2,
      limit: 100,
      search: query,
      sortOrder: 'DESC',
    })),
  );

  return [firstPage, ...remainingPages].flatMap((page) => page.data);
}

export function FreelancerCvPanel({
  accessToken,
  onNotify,
  loadRecruitmentRounds,
  isChangePasswordFormOpen = false,
  onCloseChangePassword,
  onPasswordChanged,
}: FreelancerCvPanelProps) {
  const [summary, setSummary] = useState<FreelancerSelfSummary | null>(null);
  const [catalogApplications, setCatalogApplications] = useState<FreelancerSelfApplication[]>([]);
  const [roundsByJobPostingId, setRoundsByJobPostingId] = useState<Record<string, AmisRecruitmentRound[]>>({});
  const [roundsLoading, setRoundsLoading] = useState(false);
  const [pagination, setPagination] = useState<ApiPagination | null>(null);
  const [applicationPage, setApplicationPage] = useState(1);
  const [filters, setFilters] = useState<FreelancerCvFilterValues>({ search: '', status: 'ALL', jd: 'ALL', dateRange: { from: '', to: '' } });
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingReferralId, setSavingReferralId] = useState<string | null>(null);
  const [editingNoteReferralId, setEditingNoteReferralId] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData(page = 1, query = filters.search) {
    setLoading(true);
    setError(null);
    setApplicationPage(1);
    try {
      const [nextSummary, nextApplications] = await Promise.all([
        getFreelancerSummary(accessToken),
        listFreelancerApplications(accessToken, { page, limit: 5, search: query, sortOrder: 'DESC' }),
      ]);
      setSummary(nextSummary);
      if ((nextApplications.pagination?.total ?? nextApplications.data.length) > nextApplications.data.length) {
        try {
          setCatalogApplications(await loadAllFreelancerApplicationsForCatalog(accessToken, query));
        } catch {
          // The paginated list remains usable if the optional catalog request fails.
          setCatalogApplications(nextApplications.data);
        }
      } else {
        setCatalogApplications(nextApplications.data);
      }
      setPagination(nextApplications.pagination);
      setDraftNotes((current) => ({
        ...Object.fromEntries(nextApplications.data.map((application) => [application.referralId, application.evaluation ?? ''])),
        ...current,
      }));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Không thể tải danh sách CV của bạn.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [accessToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData(1, filters.search);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [filters.search]);

  const jdOptions = useMemo(() => {
    const values = new Map<string, string>();
    catalogApplications.forEach((application) => values.set(application.jobPosting.jobPostingId, application.jobPosting.title));
    return Array.from(values.entries());
  }, [catalogApplications]);

  useEffect(() => {
    let cancelled = false;

    async function loadRounds() {
      const targets = Array.from(new Map(
        catalogApplications
          .filter((application) => (
            Boolean((application.jobPosting.amisRecruitmentId ?? application.jobPosting.sourceJobId)?.trim())
            && (filters.jd === 'ALL' || application.jobPosting.jobPostingId === filters.jd)
          ))
          .map((application) => [application.jobPosting.jobPostingId, {
            jobPostingId: application.jobPosting.jobPostingId,
            amisRecruitmentId: (application.jobPosting.amisRecruitmentId ?? application.jobPosting.sourceJobId)?.trim() ?? '',
          }]),
      ).values());

      if (!loadRecruitmentRounds || targets.length === 0) {
        setRoundsByJobPostingId({});
        setRoundsLoading(false);
        return;
      }

      setRoundsLoading(true);
      try {
        const results = await loadRecruitmentRounds(targets);
        if (cancelled) return;
        setRoundsByJobPostingId(Object.fromEntries(results.map((result) => [result.jobPostingId, result.rounds])));
      } catch {
        if (!cancelled) setRoundsByJobPostingId({});
      } finally {
        if (!cancelled) setRoundsLoading(false);
      }
    }

    void loadRounds();
    return () => {
      cancelled = true;
    };
  }, [catalogApplications, filters.jd, loadRecruitmentRounds]);

  const scopedApplications = useMemo(
    () => filters.jd === 'ALL'
      ? catalogApplications
      : catalogApplications.filter((application) => application.jobPosting.jobPostingId === filters.jd),
    [catalogApplications, filters.jd],
  );
  const statusOptions = useMemo(() => {
    const configuredRounds = scopedApplications.flatMap((application) => (
      roundsByJobPostingId[application.jobPosting.jobPostingId] ?? []
    )).map((round) => ({ id: round.id, name: round.name, sortOrder: round.sortOrder }));
    const currentStageRounds = scopedApplications
      .map((application) => application.currentAmisStage)
      .filter((stage): stage is NonNullable<typeof stage> => Boolean(stage?.recruitmentRoundName?.trim()))
      .map((stage) => ({
        id: stage.recruitmentRoundId,
        name: stage.recruitmentRoundName?.trim() ?? '',
        sortOrder: Number.MAX_SAFE_INTEGER - 4,
      }));
    return buildFreelancerCvStatusOptions([...configuredRounds, ...currentStageRounds]);
  }, [roundsByJobPostingId, scopedApplications]);

  useEffect(() => {
    if (statusOptions.some((option) => option.value === filters.status)) return;
    setFilters((current) => ({ ...current, status: 'ALL' }));
  }, [filters.status, statusOptions]);

  const visibleApplications = useMemo(() => catalogApplications.filter((application) => {
    if (!matchesFreelancerCvStatus(application, filters.status, statusOptions)) return false;
    if (filters.jd !== 'ALL' && application.jobPosting.jobPostingId !== filters.jd) return false;

    const appliedAt = new Date(application.appliedAt).getTime();
    if (filters.dateRange.from && appliedAt < new Date(`${filters.dateRange.from}T00:00:00`).getTime()) return false;
    if (filters.dateRange.to && appliedAt > new Date(`${filters.dateRange.to}T23:59:59`).getTime()) return false;
    return true;
  }), [catalogApplications, filters, statusOptions]);

  const totalApplicationPages = Math.max(1, Math.ceil(visibleApplications.length / FREELANCER_CV_PAGE_SIZE));
  const currentApplicationPage = Math.min(applicationPage, totalApplicationPages);
  const pagedApplications = useMemo(() => {
    const start = (currentApplicationPage - 1) * FREELANCER_CV_PAGE_SIZE;
    return visibleApplications.slice(start, start + FREELANCER_CV_PAGE_SIZE);
  }, [currentApplicationPage, visibleApplications]);

  const pageMetrics = useMemo(() => {
    const passed = catalogApplications.filter((application) => getStatusCategory(application) === 'PASSED').length;
    const rejected = catalogApplications.filter((application) => getStatusCategory(application) === 'REJECTED').length;
    const total = summary?.applicationCount ?? pagination?.total ?? 0;
    return {
      total,
      processing: Math.max(0, total - passed - rejected),
      passed,
      passRate: total ? Math.round((passed / total) * 100) : 0,
    };
  }, [catalogApplications, pagination?.total, summary?.applicationCount]);

  async function saveNote(application: FreelancerSelfApplication) {
    setSavingReferralId(application.referralId);
    try {
      const updated = await updateFreelancerApplicationEvaluation(
        accessToken,
        application.referralId,
        draftNotes[application.referralId]?.trim() || null,
      );
      setDraftNotes((current) => ({ ...current, [updated.referralId]: updated.evaluation ?? '' }));
      setEditingNoteReferralId(null);
      onNotify?.('SUCCESS', 'Thành công', 'Đã lưu ghi chú');
    } catch (err) {
      onNotify?.('ERROR', 'Không thể lưu', err instanceof ApiClientError ? err.message : 'Vui lòng thử lại.');
    } finally {
      setSavingReferralId(null);
    }
  }

  async function submitPasswordChange(input: { currentPassword: string; newPassword: string; confirmPassword: string }) {
    setIsChangingPassword(true);
    setChangePasswordError(null);
    try {
      const response = await changePassword(accessToken, input);
      onNotify?.('SUCCESS', 'Đổi mật khẩu', response?.message || 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.');
      onCloseChangePassword?.();
      onPasswordChanged?.();
    } catch (err) {
      setChangePasswordError(err instanceof ApiClientError ? err.message : 'Không thể đổi mật khẩu.');
    } finally {
      setIsChangingPassword(false);
    }
  }

  if (isChangePasswordFormOpen) {
    return (
      <section className="freelancer-cv-panel freelancer-change-password-view">
        <ChangePasswordForm
          error={changePasswordError}
          isSaving={isChangingPassword}
          onCancel={() => {
            setChangePasswordError(null);
            onCloseChangePassword?.();
          }}
          onSubmit={submitPasswordChange}
        />
      </section>
    );
  }

  return (
    <section className="freelancer-cv-panel">
      {summary ? (
        <div className={`freelancer-cv-identity${summary.user.role === 'INTERNAL' ? ' is-internal' : ''}`}>
          <div>
            <span className="freelancer-cv-eyebrow">Nhân sự</span>
            <h2>{summary.user.name}</h2>
            <em>
              {summary.user.role === 'INTERNAL'
                ? `Email nội bộ: ${summary.user.email}`
                : `Mã định danh: ${summary.identifier}`}
            </em>
          </div>
        </div>
      ) : null}

      <StatsMetricGrid
        ariaLabel="Thống kê CV"
        items={[
          { label: 'TỔNG CV GỬI', value: pageMetrics.total },
          { label: 'ĐANG XỬ LÝ', value: pageMetrics.processing },
          { label: 'ĐÃ ĐẬU', value: pageMetrics.passed, accent: true },
          { label: 'TỈ LỆ ĐẬU', value: `${pageMetrics.passRate}%`, accent: true },
        ]}
      />

      <FreelancerCvFilters
        value={filters}
        statusOptions={[
          ...statusOptions.map((option) => ({ value: option.value, label: option.label })),
        ]}
        jdOptions={[{ value: 'ALL', label: 'Tất cả các vòng' }, ...jdOptions.map(([value, label]) => ({ value, label }))]}
        statusDisabled={roundsLoading}
        onChange={(nextFilters) => {
          setApplicationPage(1);
          setFilters(nextFilters);
        }}
      />

      {loading ? <p className="muted-text">Đang tải danh sách CV...</p> : null}
      {error ? (
        <div className="freelancer-cv-empty freelancer-cv-error">
          <p>{error}</p>
        </div>
      ) : null}
      {!loading && !error && visibleApplications.length === 0 ? (
        <div className="freelancer-cv-empty"><span>{catalogApplications.length === 0 ? 'Chưa tải lên CV nào' : 'Chưa có CV phù hợp'}</span></div>
      ) : null}

      <div className="freelancer-cv-list">
        {pagedApplications.map((application) => {
          const note = draftNotes[application.referralId] ?? application.evaluation ?? '';
          const isEditingNote = editingNoteReferralId === application.referralId;
          const category = getStatusCategory(application);
          return (
            <article className="freelancer-cv-card" key={application.referralId}>
              <header>
                <div className="freelancer-cv-card-heading">
                  <CandidateAvatar name={application.candidate.fullName} />
                  <div>
                    <h3 className="freelancer-cv-candidate-name" title={application.candidate.fullName}>
                      {application.candidate.fullName}
                    </h3>
                    <p><JobDescriptionIcon />{application.jobPosting.title}</p>
                    <span className="freelancer-cv-applied-at"><AppliedDateIcon />Ngày ứng tuyển: <strong>{formatDateTime(application.appliedAt)}</strong></span>
                  </div>
                </div>
                <span className={`freelancer-cv-status is-${category.toLowerCase()}`}>{STATUS_LABELS[category]}</span>
              </header>
              <div className="freelancer-cv-card-meta">
                <div><span>TRẠNG THÁI CV HIỆN TẠI</span><strong>{getStatusLabel(application)}</strong></div>
                <div>
                  <span>TA PHỤ TRÁCH</span>
                  <strong>
                    {application.attractivePersonnelName?.trim()
                      || application.assignees[0]?.name
                      || 'Chưa phân công'}
                  </strong>
                </div>
              </div>
              <div className="freelancer-cv-note">
                <label htmlFor={`freelancer-note-${application.referralId}`}>Ghi chú của bạn</label>
                <textarea
                  id={`freelancer-note-${application.referralId}`}
                  value={note}
                  onFocus={() => setEditingNoteReferralId(application.referralId)}
                  onChange={(event) => setDraftNotes((current) => ({ ...current, [application.referralId]: event.target.value }))}
                  placeholder="Nhập ghi chú của bạn tại đây"
                  maxLength={255}
                />
              </div>
              {isEditingNote ? (
                <footer>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setDraftNotes((current) => ({ ...current, [application.referralId]: application.evaluation ?? '' }));
                      setEditingNoteReferralId(null);
                    }}
                  >
                    HỦY
                  </button>
                  <button type="button" className="primary-button freelancer-cv-save-button" onClick={() => void saveNote(application)} disabled={savingReferralId === application.referralId}>
                    <SaveNoteIcon />
                    {savingReferralId === application.referralId ? 'Đang lưu...' : 'LƯU'}
                  </button>
                </footer>
              ) : null}
            </article>
          );
        })}
      </div>

      {totalApplicationPages > 1 ? (
        <FreelancerCvPagination
          page={currentApplicationPage}
          total={visibleApplications.length}
          totalPages={totalApplicationPages}
          onPageChange={setApplicationPage}
        />
      ) : null}
    </section>
  );
}

function FreelancerCvPagination({
  page,
  total,
  totalPages,
  onPageChange,
}: {
  page: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const start = (page - 1) * FREELANCER_CV_PAGE_SIZE + 1;
  const end = Math.min(page * FREELANCER_CV_PAGE_SIZE, total);

  return (
    <nav className="freelancer-cv-pagination" aria-label="Phân trang danh sách CV">
      <span>Hiển thị từ {start} - {end} của {total} kết quả</span>
      <div>
        <button
          type="button"
          className="freelancer-cv-page-button"
          aria-label="Trang trước"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          ‹
        </button>
        {buildFreelancerCvPaginationPages(page, totalPages).map((paginationPage, index) => (
          paginationPage === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="freelancer-cv-pagination-ellipsis" aria-hidden="true">…</span>
          ) : (
            <button
              key={paginationPage}
              type="button"
              className={`freelancer-cv-page-button${paginationPage === page ? ' is-active' : ''}`}
              aria-current={paginationPage === page ? 'page' : undefined}
              onClick={() => onPageChange(paginationPage)}
            >
              {paginationPage}
            </button>
          )
        ))}
        <button
          type="button"
          className="freelancer-cv-page-button"
          aria-label="Trang sau"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          ›
        </button>
      </div>
    </nav>
  );
}

function getStatusCategory(application: FreelancerSelfApplication): StatusCategory {
  if (application.statusCategory) return application.statusCategory;
  const value = `${application.processStatus ?? ''} ${application.hrReceptionStatus ?? ''}`.toUpperCase();
  if (value.includes('REJECT') || value.includes('INVALID') || value.includes('MALWARE')) return 'REJECTED';
  if (value.includes('APPROVED') || value.includes('TALENT_POOL') || value.includes('PASSED')) return 'PASSED';
  return 'PROCESSING';
}

function getStatusLabel(application: FreelancerSelfApplication) {
  if (isFreelancerCvFormSent(application)) return 'Screening CV';
  const currentStageName = application.currentAmisStage?.recruitmentRoundName?.trim();
  if (currentStageName) return currentStageName;
  const status = application.hrReceptionStatus || application.processStatus;
  if (!status) return 'Chưa cập nhật';
  return status.replaceAll('_', ' ').toLocaleLowerCase('vi-VN').replace(/^./, (value) => value.toUpperCase());
}

function formatDateTime(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
