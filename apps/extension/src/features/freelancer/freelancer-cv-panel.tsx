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
import { Pagination } from '@/components/pagination/Pagination';
import { ChangePasswordForm } from '@/features/auth/ChangePasswordForm';
import { FreelancerCvFilters } from './components/FreelancerCvFilters';
import type { FreelancerCvFilterValues } from './components/FreelancerCvFilters';
import type { ApiPagination, FreelancerSelfApplication, FreelancerSelfSummary } from '@/types/types';

type FreelancerCvPanelProps = {
  accessToken: string;
  onNotify?: (kind: 'SUCCESS' | 'ERROR', title: string, message: string) => void;
  isChangePasswordFormOpen?: boolean;
  onCloseChangePassword?: () => void;
  onPasswordChanged?: () => void;
};

type StatusCategory = 'PROCESSING' | 'PASSED' | 'REJECTED';

export function FreelancerCvPanel({
  accessToken,
  onNotify,
  isChangePasswordFormOpen = false,
  onCloseChangePassword,
  onPasswordChanged,
}: FreelancerCvPanelProps) {
  const [summary, setSummary] = useState<FreelancerSelfSummary | null>(null);
  const [applications, setApplications] = useState<FreelancerSelfApplication[]>([]);
  const [pagination, setPagination] = useState<ApiPagination | null>(null);
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
    try {
      const [nextSummary, nextApplications] = await Promise.all([
        getFreelancerSummary(accessToken),
        listFreelancerApplications(accessToken, { page, limit: 20, search: query, sortOrder: 'DESC' }),
      ]);
      setSummary(nextSummary);
      setApplications(nextApplications.data);
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
    applications.forEach((application) => values.set(application.jobPosting.jobPostingId, application.jobPosting.title));
    return Array.from(values.entries());
  }, [applications]);

  const visibleApplications = useMemo(() => applications.filter((application) => {
    const category = getStatusCategory(application);
    if (filters.status !== 'ALL' && category !== filters.status) return false;
    if (filters.jd !== 'ALL' && application.jobPosting.jobPostingId !== filters.jd) return false;

    const appliedAt = new Date(application.appliedAt).getTime();
    if (filters.dateRange.from && appliedAt < new Date(`${filters.dateRange.from}T00:00:00`).getTime()) return false;
    if (filters.dateRange.to && appliedAt > new Date(`${filters.dateRange.to}T23:59:59`).getTime()) return false;
    return true;
  }), [applications, filters]);

  const pageMetrics = useMemo(() => {
    const passed = applications.filter((application) => getStatusCategory(application) === 'PASSED').length;
    const rejected = applications.filter((application) => getStatusCategory(application) === 'REJECTED').length;
    const total = summary?.applicationCount ?? pagination?.total ?? 0;
    return {
      total,
      processing: Math.max(0, total - passed - rejected),
      passed,
      passRate: total ? Math.round((passed / total) * 1000) / 10 : 0,
    };
  }, [applications, pagination?.total, summary?.applicationCount]);

  async function saveNote(application: FreelancerSelfApplication) {
    setSavingReferralId(application.referralId);
    try {
      const updated = await updateFreelancerApplicationEvaluation(
        accessToken,
        application.referralId,
        draftNotes[application.referralId]?.trim() || null,
      );
      setApplications((current) => current.map((item) => item.referralId === updated.referralId ? updated : item));
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
      await changePassword(accessToken, input);
      onNotify?.('SUCCESS', 'Thành công', 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.');
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
        <div className="freelancer-cv-identity">
          <div>
            <span className="freelancer-cv-eyebrow">Nhân sự</span>
            <h2>{summary.user.name}</h2>
            <em>Mã định danh: {summary.identifier}</em>
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
          { value: 'ALL', label: 'Tất cả các vòng' },
          { value: 'PROCESSING', label: 'Đang xử lý' },
          { value: 'PASSED', label: 'Đã đậu' },
          { value: 'REJECTED', label: 'Không đạt' },
        ]}
        jdOptions={[{ value: 'ALL', label: 'Tất cả các vòng' }, ...jdOptions.map(([value, label]) => ({ value, label }))]}
        onChange={setFilters}
      />

      {loading ? <p className="muted-text">Đang tải danh sách CV...</p> : null}
      {error ? (
        <div className="freelancer-cv-empty freelancer-cv-error">
          <p>{error}</p>
        </div>
      ) : null}
      {!loading && !error && visibleApplications.length === 0 ? (
        <div className="freelancer-cv-empty"><span>Chưa có CV phù hợp</span></div>
      ) : null}

      <div className="freelancer-cv-list">
        {visibleApplications.map((application) => {
          const note = draftNotes[application.referralId] ?? application.evaluation ?? '';
          const isEditingNote = editingNoteReferralId === application.referralId;
          return (
            <article className="freelancer-cv-card" key={application.referralId}>
              <header>
                <div className="freelancer-cv-card-heading">
                  <CandidateAvatar name={application.candidate.fullName} />
                  <div>
                    <h3>{application.candidate.fullName}</h3>
                    <p><JobDescriptionIcon />{application.jobPosting.title}</p>
                    <span className="freelancer-cv-applied-at"><AppliedDateIcon />Ngày ứng tuyển: <strong>{formatDateTime(application.appliedAt)}</strong></span>
                  </div>
                </div>
                {/* <span className={`freelancer-cv-status is-${category.toLowerCase()}`}>{STATUS_LABELS[category]}</span> */}
              </header>
              <div className="freelancer-cv-card-meta">
                <div><span>TRẠNG THÁI CV HIỆN TẠI</span><strong>{getStatusLabel(application)}</strong></div>
                <div><span>TA PHỤ TRÁCH</span><strong>{application.assignees[0]?.name ?? 'Chưa phân công'}</strong></div>
              </div>
              <div className="freelancer-cv-note">
                <label htmlFor={`freelancer-note-${application.referralId}`}>Ghi chú của bạn</label>
                <textarea
                  id={`freelancer-note-${application.referralId}`}
                  value={note}
                  onFocus={() => setEditingNoteReferralId(application.referralId)}
                  onChange={(event) => setDraftNotes((current) => ({ ...current, [application.referralId]: event.target.value }))}
                  placeholder="Nhập ghi chú của bạn tại đây"
                  maxLength={2000}
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

      {pagination && pagination.total > 0 ? (
        <Pagination
          className="freelancer-cv-pagination"
          page={pagination.page}
          limit={pagination.limit}
          total={pagination.total}
          totalPages={pagination.totalPages}
          onPageChange={(page) => void loadData(page)}
        />
      ) : null}
    </section>
  );
}

function getStatusCategory(application: FreelancerSelfApplication): StatusCategory {
  const value = `${application.processStatus ?? ''} ${application.hrReceptionStatus ?? ''}`.toUpperCase();
  if (value.includes('REJECT') || value.includes('INVALID') || value.includes('MALWARE')) return 'REJECTED';
  if (value.includes('APPROVED') || value.includes('TALENT_POOL') || value.includes('PASSED')) return 'PASSED';
  return 'PROCESSING';
}

function getStatusLabel(application: FreelancerSelfApplication) {
  const status = application.hrReceptionStatus || application.processStatus;
  if (!status) return 'Chưa cập nhật';
  return status.replaceAll('_', ' ').toLocaleLowerCase('vi-VN').replace(/^./, (value) => value.toUpperCase());
}

function formatDateTime(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
