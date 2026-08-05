import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiClientError,
  createFreelancer,
  createInternal,
  getReferralManagementSources,
  updateFreelancerStatus,
  updateInternalStatus,
} from './api-client';
import type {
  CreatedFreelancerResult,
  ReferralManagementApplication,
  ReferralManagementPerson,
  ReferralManagementSource,
} from './types';
import { buildFreelancerIdentifierCopyText } from './referral-management-utils';

type CvStatusFilter = 'ALL' | 'APPLICATION' | 'TEST' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED';
type JdFilter = 'ALL' | string;
type AccountStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type ModalMode = 'CREATE' | 'CREDENTIALS' | 'STATUS' | null;
type NotifyKind = 'SUCCESS' | 'ERROR';

interface ReferralManagementProps {
  source: ReferralManagementSource;
  accessToken: string;
  refreshVersion: number;
  onNotify?: (kind: NotifyKind, title: string, message: string) => void;
}

const INTERNAL_EMAIL_PATTERN = /^[^\s@]+@viettel\.com\.vn$/i;
const CV_STATUS_FILTER_OPTIONS: Array<{ value: CvStatusFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả các vòng' },
  { value: 'APPLICATION', label: 'Ứng tuyển' },
  { value: 'TEST', label: 'Thi tuyển' },
  { value: 'INTERVIEW', label: 'Phỏng vấn' },
  { value: 'OFFER', label: 'Offer' },
  { value: 'HIRED', label: 'Đã tuyển' },
  { value: 'REJECTED', label: 'Loại' },
];

export function ReferralManagementPanel({ source, accessToken, refreshVersion, onNotify }: ReferralManagementProps) {
  const [people, setPeople] = useState<ReferralManagementPerson[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [cvStatusFilter, setCvStatusFilter] = useState<CvStatusFilter>('ALL');
  const [jdFilter, setJdFilter] = useState<JdFilter>('ALL');
  const [accountStatusFilter, setAccountStatusFilter] = useState<AccountStatusFilter>('ALL');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalMode>(null);
  const [selectedPerson, setSelectedPerson] = useState<ReferralManagementPerson | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createdFreelancer, setCreatedFreelancer] = useState<CreatedFreelancerResult | null>(null);
  const [copiedIdentifier, setCopiedIdentifier] = useState<string | null>(null);
  const onNotifyRef = useRef(onNotify);

  useEffect(() => {
    onNotifyRef.current = onNotify;
  }, [onNotify]);

  const loadPeople = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getReferralManagementSources(accessToken, source, {
        page,
        limit: 10,
        search,
        status: accountStatusFilter === 'ALL' ? undefined : accountStatusFilter,
      });
      setPeople(result.data);
      setPagination(result.pagination ?? { page, limit: 10, total: result.data.length, totalPages: 1 });
    } catch (loadError) {
      const message = getErrorMessage(loadError);
      setError(message);
      onNotifyRef.current?.('ERROR', 'Không tải được dữ liệu', message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, accountStatusFilter, page, refreshVersion, search, source]);

  useEffect(() => {
    void loadPeople();
  }, [loadPeople]);

  const availableJds = useMemo(() => {
    const jdMap = new Map<string, string>();
    people.forEach((person) => {
      person.applications.forEach((application) => {
        jdMap.set(application.jobPosting.jobPostingId, application.jobPosting.title);
      });
    });
    return [...jdMap.entries()].sort((left, right) => left[1].localeCompare(right[1], 'vi'));
  }, [people]);

  const filteredPeople = useMemo(() => people
    .map((person) => ({
      person,
      applications: person.applications.filter((application) => (
        (jdFilter === 'ALL' || application.jobPosting.jobPostingId === jdFilter)
        && matchesCvStatus(application, cvStatusFilter)
      )),
    }))
    .filter(({ person, applications }) => (
      (cvStatusFilter === 'ALL' && jdFilter === 'ALL') || applications.length > 0 || person.applications.length === 0
    )), [cvStatusFilter, jdFilter, people]);

  function openCreateModal() {
    setName('');
    setEmail('');
    setPhone('');
    setFormError(null);
    setCreatedFreelancer(null);
    setModal('CREATE');
  }

  function closeModal() {
    if (saving) return;
    setModal(null);
    setSelectedPerson(null);
    setFormError(null);
    setCreatedFreelancer(null);
  }

  async function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const normalizedEmail = email.trim().toLowerCase();

    if (source === 'FREELANCER') {
      if (!name.trim()) {
        setFormError('Vui lòng nhập họ và tên Freelancer.');
        return;
      }
      if (!normalizedEmail) {
        setFormError('Vui lòng nhập email Freelancer.');
        return;
      }
    } else if (!INTERNAL_EMAIL_PATTERN.test(normalizedEmail)) {
      setFormError('Email Nội bộ phải có đuôi @viettel.com.vn.');
      return;
    }

    setSaving(true);
    try {
      if (source === 'FREELANCER') {
        const result = await createFreelancer(accessToken, {
          name: name.trim(),
          email: normalizedEmail,
          phone: phone.trim() || undefined,
        });
        setCreatedFreelancer(result);
        setModal('CREDENTIALS');
        onNotify?.('SUCCESS', 'Đã thêm Freelancer', `${result.identifier} đã được tạo.`);
      } else {
        await createInternal(accessToken, normalizedEmail);
        onNotify?.('SUCCESS', 'Đã thêm Nội bộ', normalizedEmail);
        setModal(null);
        setFormError(null);
      }
      setPage(1);
      await loadPeople();
    } catch (createError) {
      setFormError(getErrorMessage(createError));
    } finally {
      setSaving(false);
    }
  }

  function requestStatusChange(person: ReferralManagementPerson) {
    setSelectedPerson(person);
    setFormError(null);
    setModal('STATUS');
  }

  async function confirmStatusChange() {
    if (!selectedPerson) return;
    setSaving(true);
    try {
      const nextStatus = !selectedPerson.isActive;
      if (source === 'FREELANCER') {
        await updateFreelancerStatus(accessToken, selectedPerson.sourceId, nextStatus);
      } else {
        await updateInternalStatus(accessToken, selectedPerson.sourceId, nextStatus);
      }
      onNotify?.(
        'SUCCESS',
        nextStatus ? 'Đã kích hoạt lại' : 'Đã vô hiệu hóa',
        nextStatus ? 'Nhân sự có thể tiếp tục được chọn làm nguồn giới thiệu.' : 'Lịch sử CV vẫn được giữ nguyên.',
      );
      setModal(null);
      setSelectedPerson(null);
      await loadPeople();
    } catch (statusError) {
      setFormError(getErrorMessage(statusError));
    } finally {
      setSaving(false);
    }
  }

  const title = source === 'FREELANCER' ? 'Freelancer' : 'Nội bộ';
  const emptyText = source === 'FREELANCER'
    ? 'Chưa có Freelancer nào.'
    : 'Chưa có người Nội bộ nào.';

  async function copyIdentifier(identifier: string) {
    try {
      await navigator.clipboard.writeText(buildFreelancerIdentifierCopyText(identifier));
      setCopiedIdentifier(identifier);
      onNotify?.('SUCCESS', 'Đã sao chép', `Mã ${identifier} đã được sao chép.`);
      window.setTimeout(() => setCopiedIdentifier((current) => current === identifier ? null : current), 1800);
    } catch {
      onNotify?.('ERROR', 'Không thể sao chép', 'Trình duyệt không cho phép sao chép mã Freelancer.');
    }
  }

  return (
    <div className="referral-management-panel">
      <div className="referral-toolbar">
        <label className="referral-search-field">
          <span className="referral-search-icon" aria-hidden="true"><SearchIcon /></span>
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder={source === 'FREELANCER' ? 'Tìm kiếm tên, Mã Freelancer' : 'Tìm kiếm email Nội bộ'}
            aria-label={`Tìm kiếm ${title}`}
          />
          {search ? (
            <button
              type="button"
              className="referral-search-clear-button"
              aria-label="Xóa nội dung tìm kiếm"
              title="Xóa nội dung tìm kiếm"
              onClick={() => {
                setSearch('');
                setPage(1);
              }}
            >
              <SearchClearIcon />
            </button>
          ) : null}
        </label>
        <button type="button" className="referral-primary-button" onClick={openCreateModal}>
          Thêm nhân sự
        </button>
        <div className="referral-filter-row">
          <label>
            <span>Tình trạng CV</span>
            <select value={cvStatusFilter} onChange={(event) => setCvStatusFilter(event.target.value as CvStatusFilter)}>
              {CV_STATUS_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span>Lọc theo JD</span>
            <select value={jdFilter} onChange={(event) => setJdFilter(event.target.value)}>
              <option value="ALL">Tất cả JD</option>
              {availableJds.map(([id, jdTitle]) => <option key={id} value={id}>{jdTitle}</option>)}
            </select>
          </label>
          <label>
            <span>Tình trạng tài khoản</span>
            <select
              value={accountStatusFilter}
              onChange={(event) => {
                setAccountStatusFilter(event.target.value as AccountStatusFilter);
                setPage(1);
              }}
            >
              <option value="ALL">Tất cả</option>
              <option value="ACTIVE">Hoạt động</option>
              <option value="INACTIVE">Đã khóa</option>
            </select>
          </label>
        </div>
      </div>

      {loading ? <div className="referral-state">Đang tải danh sách...</div> : null}
      {!loading && error ? <div className="referral-state is-error">{error}</div> : null}
      {!loading && !error && filteredPeople.length === 0 ? <div className="referral-state">{people.length ? 'Không có CV phù hợp với bộ lọc.' : emptyText}</div> : null}

      {!loading && !error && filteredPeople.length > 0 ? (
        <div className="referral-people-list">
          {filteredPeople.map(({ person, applications }) => {
            const isExpanded = Boolean(expandedIds[person.sourceId]);
            const metrics = person.metrics;
            return (
              <article className={`referral-person-card${person.isActive ? '' : ' is-inactive'}`} key={person.sourceId}>
                <div className="referral-person-heading">
                  <div className="referral-person-identity">
                    <h3>{person.name || person.email}</h3>
                    <div className="referral-person-meta">
                      {person.identifier ? (
                        <span className="referral-identifier">
                          <span>{person.identifier}</span>
                          <button
                            type="button"
                            className={`referral-copy-button${copiedIdentifier === person.identifier ? ' is-copied' : ''}`}
                            onClick={() => void copyIdentifier(person.identifier as string)}
                            title="Sao chép mã Freelancer"
                            aria-label="Sao chép mã Freelancer"
                          >
                            {copiedIdentifier === person.identifier ? 'Đã copy' : <CopyIcon />}
                          </button>
                        </span>
                      ) : null}
                      <span>{person.email}</span>
                      {person.phone ? <span>{person.phone}</span> : null}
                    </div>
                  </div>
                  <div className="referral-person-actions">
                    <span className={`referral-active-badge${person.isActive ? '' : ' is-inactive'}`}>
                      {person.isActive ? 'Đang hoạt động' : 'Đã vô hiệu hóa'}
                    </span>
                    <button
                      type="button"
                      className="referral-status-icon-button"
                      onClick={() => requestStatusChange(person)}
                      title={person.isActive ? 'Vô hiệu hóa, giữ lịch sử' : 'Kích hoạt lại'}
                      aria-label={person.isActive ? 'Vô hiệu hóa, giữ lịch sử' : 'Kích hoạt lại'}
                    >
                      {source === 'FREELANCER' && person.isActive ? <TrashIcon /> : <PowerIcon />}
                    </button>
                  </div>
                </div>

                <div className="referral-metrics-grid">
                  <Metric label="TỔNG CV GỬI" value={metrics.total} />
                  <Metric label="ĐANG XỬ LÝ" value={metrics.processing} />
                  <Metric label="ĐÃ ĐẬU" value={metrics.passed} isPositive />
                  <Metric label="TỈ LỆ ĐẬU" value={`${metrics.passRate}%`} isPositive />
                </div>

                <button
                  type="button"
                  className="referral-detail-toggle"
                  onClick={() => setExpandedIds((current) => ({ ...current, [person.sourceId]: !isExpanded }))}
                  aria-expanded={isExpanded}
                >
                  <span>Chi tiết</span>
                  <DetailChevronIcon isOpen={isExpanded} />
                </button>

                {isExpanded ? <ApplicationTable applications={applications} /> : null}
              </article>
            );
          })}
        </div>
      ) : null}

      {pagination.totalPages > 1 ? (
        <div className="referral-pagination">
          <span>Hiển thị {people.length ? (page - 1) * pagination.limit + 1 : 0} - {(page - 1) * pagination.limit + people.length} của {pagination.total} kết quả</span>
          <div>
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>‹</button>
            <strong>{page}</strong>
            <button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}>›</button>
          </div>
        </div>
      ) : null}

      {modal === 'CREATE' ? (
        <div className="referral-modal-backdrop" role="presentation">
          <section className="referral-modal" role="dialog" aria-modal="true" aria-labelledby="referral-create-title">
            <div className="referral-modal-header">
              <h2 id="referral-create-title">Thêm {title} mới</h2>
              <button type="button" onClick={closeModal} aria-label="Đóng">×</button>
            </div>
            <form onSubmit={submitCreate}>
              {source === 'FREELANCER' ? (
                <>
                  <label>HỌ VÀ TÊN<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nhập tên Freelancer mới..." /></label>
                  <label>EMAIL<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="freelancer@gmail.com" /></label>
                  <label>SỐ ĐIỆN THOẠI<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0988098797" /></label>
                </>
              ) : (
                <label>EMAIL NỘI BỘ<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="ten.nguoi@viettel.com.vn" /></label>
              )}
              {formError ? <p className="referral-form-error">{formError}</p> : null}
              <div className="referral-modal-actions">
                <button type="button" className="referral-secondary-button" onClick={closeModal}>Hủy</button>
                <button type="submit" className="referral-primary-button" disabled={saving}>{saving ? 'Đang lưu...' : 'Thêm mới'}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {modal === 'CREDENTIALS' && createdFreelancer ? (
        <div className="referral-modal-backdrop" role="presentation">
          <section className="referral-modal" role="dialog" aria-modal="true" aria-labelledby="referral-credentials-title">
            <div className="referral-modal-header">
              <h2 id="referral-credentials-title">Đã thêm Freelancer</h2>
              <button type="button" onClick={closeModal} aria-label="Đóng">×</button>
            </div>
            <div className="referral-credentials-body">
              <p>Gửi thông tin dưới đây cho Freelancer để đăng nhập và theo dõi CV.</p>
              <div><span>Mã định danh</span><strong>{createdFreelancer.identifier}</strong></div>
              <div><span>Mật khẩu khởi tạo</span><strong>{createdFreelancer.initialPassword}</strong></div>
              <button type="button" className="referral-primary-button" onClick={() => void copyCredentials(createdFreelancer)}>
                Sao chép thông tin
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {modal === 'STATUS' && selectedPerson ? (
        <div className="referral-modal-backdrop" role="presentation">
          <section className="referral-modal referral-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="referral-status-title">
            <div className="referral-modal-header">
              <h2 id="referral-status-title">{selectedPerson.isActive ? 'Xác nhận vô hiệu hóa' : 'Xác nhận kích hoạt lại'}</h2>
              <button type="button" onClick={closeModal} aria-label="Đóng">×</button>
            </div>
            <div className="referral-confirm-body">
              <WarningIcon />
              <h3>{selectedPerson.isActive ? 'Bạn có chắc muốn vô hiệu hóa nhân sự này không?' : 'Bạn có muốn kích hoạt lại nhân sự này không?'}</h3>
              <p>{selectedPerson.isActive ? 'Lịch sử CV và dữ liệu liên quan vẫn được giữ nguyên, chỉ ngừng sử dụng nhân sự này làm nguồn giới thiệu mới.' : 'Nhân sự này sẽ có thể tiếp tục được chọn làm nguồn giới thiệu.'}</p>
              <strong>{selectedPerson.name || selectedPerson.email}</strong>
            </div>
            {formError ? <p className="referral-form-error">{formError}</p> : null}
            <div className="referral-modal-actions">
              <button type="button" className="referral-secondary-button" onClick={closeModal}>Hủy</button>
              <button type="button" className="referral-primary-button" disabled={saving} onClick={() => void confirmStatusChange()}>{saving ? 'Đang lưu...' : 'Xác nhận'}</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, isPositive = false }: { label: string; value: number | string; isPositive?: boolean }) {
  return <div className="referral-metric"><span>{label}</span><strong className={isPositive ? 'is-positive' : ''}>{value}</strong></div>;
}

function ApplicationTable({ applications }: { applications: ReferralManagementApplication[] }) {
  if (applications.length === 0) return <div className="referral-empty-detail">Chưa có CV nào được gửi.</div>;

  return (
    <div className="referral-table-wrap">
      <table className="referral-application-table">
        <thead><tr><th>STT</th><th>CV</th><th>JD</th><th>Tình trạng xử lý</th><th>Thời gian nộp CV</th><th>TA quản lý</th><th>Ghi chú</th></tr></thead>
        <tbody>{applications.map((application, index) => (
          <tr key={application.applicationId}>
            <td>{String(index + 1).padStart(2, '0')}</td>
            <td>{application.candidate.fullName}</td>
            <td>{application.jobPosting.title}</td>
            <td><StatusPill application={application} /></td>
            <td>{formatDate(application.appliedAt)}</td>
            <td>{application.assignees.map((assignee) => assignee.name).join(', ') || '—'}</td>
            <td>{application.evaluation || '—'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function StatusPill({ application }: { application: ReferralManagementApplication }) {
  const { label, className } = getApplicationStatus(application);
  return <span className={`referral-status-pill ${className}`}><i />{label}</span>;
}

function matchesCvStatus(application: ReferralManagementApplication, filter: CvStatusFilter): boolean {
  if (filter === 'ALL') return true;

  const stageName = normalizeAmisStageName(application.currentAmisStage?.recruitmentRoundName);
  if (filter === 'REJECTED') return application.statusCategory === 'REJECTED' || application.currentAmisStage?.amisStatus === 0;
  if (filter === 'HIRED') return application.statusCategory === 'PASSED';
  if (filter === 'APPLICATION') return stageName.includes('UNG TUYEN');
  if (filter === 'TEST') return stageName.includes('THI TUYEN');
  if (filter === 'INTERVIEW') return stageName.includes('PHONG VAN');
  if (filter === 'OFFER') return stageName.includes('OFFER');
  return false;
}

function getApplicationStatus(application: ReferralManagementApplication) {
  const currentStageName = application.currentAmisStage?.recruitmentRoundName?.trim();
  const normalizedStageName = normalizeAmisStageName(currentStageName);

  if (application.statusCategory === 'REJECTED' || application.currentAmisStage?.amisStatus === 0) {
    return { label: 'Loại', className: 'is-rejected' };
  }
  if (application.statusCategory === 'PASSED' || normalizedStageName.includes('DA TUYEN')) {
    return { label: 'Đã tuyển', className: 'is-passed' };
  }
  if (currentStageName) {
    return { label: currentStageName, className: 'is-processing' };
  }
  if (application.hrReceptionStatus === 'REJECT' || application.processStatus === 'HR_REJECTED') {
    return { label: 'Loại', className: 'is-rejected' };
  }
  if (application.hrReceptionStatus === 'APPROVE' || application.hrReceptionStatus === 'TALENT_POOL' || application.processStatus === 'HR_APPROVED' || application.processStatus === 'TALENT_POOL') {
    return { label: 'Đã tuyển', className: 'is-passed' };
  }
  if (application.processStatus === 'WAITING_HR_REVIEW') return { label: 'Chờ', className: 'is-waiting' };
  if (application.processStatus?.includes('FORM') || application.processStatus?.includes('SCREENING')) return { label: 'Trao đổi', className: 'is-discussion' };
  return { label: 'Chưa cập nhật vòng', className: 'is-processing' };
}

function normalizeAmisStageName(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .toUpperCase()
    .trim();
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Có lỗi xảy ra, vui lòng thử lại.';
}

async function copyCredentials(result: CreatedFreelancerResult) {
  await navigator.clipboard?.writeText(`Mã định danh: ${result.identifier}\nMật khẩu: ${result.initialPassword}`);
}

function TrashIcon() {
  return <svg className="referral-action-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M10 4h4l1 3H9l1-3ZM7 7l1 13h8l1-13M10 10v7M14 10v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function PowerIcon() {
  return <svg className="referral-action-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M12 3v8M7.2 5.8a8 8 0 1 0 9.6 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}

function WarningIcon() {
  return <svg className="referral-warning-icon" aria-hidden="true" viewBox="0 0 32 32" fill="none"><path d="m16 4 13 23H3L16 4Z" fill="currentColor" /><path d="M16 11v8M16 23h.01" stroke="white" strokeWidth="2.5" strokeLinecap="round" /></svg>;
}

function CopyIcon() {
  return <svg className="referral-copy-icon" aria-hidden="true" viewBox="0 0 16 16" fill="none"><rect x="5.2" y="4.4" width="7.2" height="8.2" rx="1.1" stroke="currentColor" strokeWidth="1.2" /><path d="M3.6 10.2H3a1 1 0 0 1-1-1V3.6a1 1 0 0 1 1-1h5.6a1 1 0 0 1 1 1v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>;
}

function SearchIcon() {
  return <svg className="referral-search-svg" aria-hidden="true" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.4" /><path d="m10.2 10.2 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
}

function SearchClearIcon() {
  return <svg className="referral-search-clear-icon" aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="m4.5 4.5 7 7m0-7-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
}

function DetailChevronIcon({ isOpen }: { isOpen: boolean }) {
  return <svg className={`referral-detail-chevron${isOpen ? ' is-open' : ''}`} aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="m4.5 6 3.5 3.5L11.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
