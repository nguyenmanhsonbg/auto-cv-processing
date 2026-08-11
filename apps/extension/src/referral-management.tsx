import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiClientError,
  createFreelancer,
  createInternal,
  getReferralManagementSources,
  listJobPostings,
  updateFreelancerStatus,
  updateInternalStatus,
} from './api-client';
import type {
  CreatedFreelancerResult,
  ReferralManagementApplication,
  ReferralManagementPerson,
  ReferralManagementSource,
  JobPostingSummary,
  AmisRecruitmentRound,
} from './types';
import { buildFreelancerIdentifierCopyText } from './referral-management-utils';

type JdFilter = 'ALL' | string;
type AccountStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type ModalMode = 'CREATE' | 'CREDENTIALS' | 'STATUS' | null;
type NotifyKind = 'SUCCESS' | 'ERROR';
type ReferralRoundOptionKind = 'ROUND' | 'HIRED' | 'REJECTED' | 'LEGACY_STAGE';

interface ReferralRoundLoadTarget {
  jobPostingId: string;
  amisRecruitmentId: string;
}

interface ReferralRoundLoadResult extends ReferralRoundLoadTarget {
  rounds: AmisRecruitmentRound[];
}

interface ReferralRoundOption {
  value: string;
  label: string;
  kind: ReferralRoundOptionKind;
  roundIds: string[];
  normalizedName: string;
  sortOrder: number;
}

interface ReferralManagementProps {
  source: ReferralManagementSource;
  accessToken: string;
  refreshVersion: number;
  onNotify?: (kind: NotifyKind, title: string, message: string) => void;
  loadRecruitmentRounds?: (
    targets: ReferralRoundLoadTarget[],
  ) => Promise<ReferralRoundLoadResult[]>;
}

function isValidReferralEmail(value: string) {
  if (!value) return false;
  let atIndex = -1;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? '';
    if (character.trim() === '' || character === '@') {
      if (character === '@' && atIndex < 0) {
        atIndex = index;
        continue;
      }
      return false;
    }
  }
  if (atIndex <= 0 || atIndex !== value.lastIndexOf('@') || atIndex === value.length - 1) return false;
  const domain = value.slice(atIndex + 1);
  const dotIndex = domain.lastIndexOf('.');
  return dotIndex > 0 && dotIndex < domain.length - 1;
}

function isInternalReferralEmail(value: string) {
  if (!isValidReferralEmail(value)) return false;
  const atIndex = value.lastIndexOf('@');
  return value.slice(atIndex + 1).toLowerCase() === 'viettel.com.vn';
}

function getCreateFormErrors(
  source: ReferralManagementSource,
  name: string,
  normalizedEmail: string,
  phone: string,
) {
  if (!name.trim()) return { nameFieldError: 'Họ và tên là bắt buộc, không được để trống.' };
  if (!isValidReferralEmail(normalizedEmail)) return { emailFieldError: 'Email không hợp lệ. Vui lòng kiểm tra lại.' };
  if (source === 'INTERNAL' && !isInternalReferralEmail(normalizedEmail)) {
    return { emailFieldError: 'Email Nội bộ phải có đuôi @viettel.com.vn.' };
  }
  if (!phone.trim()) {
    return {
      formError: source === 'FREELANCER'
        ? 'Vui lòng nhập số điện thoại Freelancer.'
        : 'Vui lòng nhập số điện thoại nhân sự nội bộ.',
    };
  }
  return null;
}

const REFERRAL_PAGE_SIZE = 5;
const REFERRAL_ALL_ROUNDS_OPTION: ReferralRoundOption = {
  value: 'ALL',
  label: 'Tất cả các vòng',
  kind: 'ROUND',
  roundIds: [],
  normalizedName: '',
  sortOrder: -1,
};

function ReferralChevronDownIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="m3.5 6 4.5 4.5L12.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReferralFilterDropdown({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? options[0]?.label ?? '';

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  return (
    <label className="referral-custom-filter">
      <span>{label}</span>
      <div ref={dropdownRef} className={`referral-filter-dropdown${isOpen ? ' is-open' : ''}`}>
        <button
          type="button"
          className="referral-filter-trigger"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          disabled={disabled}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span>{selectedLabel}</span>
          <ReferralChevronDownIcon />
        </button>
        {isOpen ? (
          <div className="referral-filter-options" role="menu" aria-label={label}>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={option.value === value}
                className={option.value === value ? 'is-selected' : ''}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </label>
  );
}

interface ReferralManagementToolbarProps {
  source: ReferralManagementSource;
  title: string;
  search: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onCreate: () => void;
  cvStatusFilter: string;
  cvRoundOptions: ReferralRoundOption[];
  roundsLoading: boolean;
  onCvStatusChange: (value: string) => void;
  jdFilter: JdFilter;
  availableJds: Array<[string, { title: string; createdAt?: string }]>;
  jdDropdownRef: React.RefObject<HTMLDivElement>;
  isJdFilterOpen: boolean;
  onToggleJdFilter: () => void;
  onJdFilterChange: (value: JdFilter) => void;
  accountStatusFilter: AccountStatusFilter;
  onAccountStatusChange: (value: string) => void;
}

function ReferralManagementToolbar({
  source,
  title,
  search,
  onSearchChange,
  onClearSearch,
  onCreate,
  cvStatusFilter,
  cvRoundOptions,
  roundsLoading,
  onCvStatusChange,
  jdFilter,
  availableJds,
  jdDropdownRef,
  isJdFilterOpen,
  onToggleJdFilter,
  onJdFilterChange,
  accountStatusFilter,
  onAccountStatusChange,
}: ReferralManagementToolbarProps) {
  const selectedJdLabel = jdFilter === 'ALL'
    ? 'Tất cả JD'
    : availableJds.find(([id]) => id === jdFilter)?.[1].title ?? 'Tất cả JD';

  return (
    <div className={'referral-toolbar' + (source === 'INTERNAL' ? ' is-internal' : '')}>
      <label className="referral-search-field">
        <span className="referral-search-icon" aria-hidden="true"><SearchIcon /></span>
        <input
          value={search}
          maxLength={64}
          onChange={(event) => onSearchChange(event.target.value.trim())}
          placeholder={source === 'FREELANCER' ? 'Tìm kiếm tên, Mã Freelancer' : 'Tìm kiếm tên, email, số điện thoại'}
          aria-label={'Tìm kiếm ' + title}
        />
        {search ? (
          <button
            type="button"
            className="referral-search-clear-button"
            aria-label="Xóa nội dung tìm kiếm"
            title="Xóa nội dung tìm kiếm"
            onClick={onClearSearch}
          >
            <SearchClearIcon />
          </button>
        ) : null}
      </label>
      {source === 'FREELANCER' ? (
        <button type="button" className="referral-primary-button" onClick={onCreate}>
          Thêm nhân sự
        </button>
      ) : null}
      <div className={'referral-filter-row' + (source === 'INTERNAL' ? ' is-internal' : '')}>
        <ReferralFilterDropdown
          label="Tình trạng CV"
          value={cvStatusFilter}
          disabled={source === 'FREELANCER' && roundsLoading}
          options={cvRoundOptions.map((option) => ({ value: option.value, label: option.label }))}
          onChange={onCvStatusChange}
        />
        <label className="referral-jd-filter-label">
          <span>Lọc theo JD</span>
          <div ref={jdDropdownRef} className="referral-jd-dropdown">
            <button
              type="button"
              className="referral-jd-select-trigger"
              aria-haspopup="menu"
              aria-expanded={isJdFilterOpen}
              onClick={onToggleJdFilter}
            >
              <span>{selectedJdLabel}</span>
              <ReferralChevronDownIcon />
            </button>
            {isJdFilterOpen ? (
              <div className="referral-jd-options" role="menu" aria-label="Danh sách JD">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={jdFilter === 'ALL'}
                  className={'referral-jd-option' + (jdFilter === 'ALL' ? ' is-selected' : '')}
                  onClick={() => onJdFilterChange('ALL')}
                >
                  <span className="referral-jd-option-label">
                    <span className={'referral-jd-checkbox' + (jdFilter === 'ALL' ? ' is-checked' : '')} aria-hidden="true">✓</span>
                    <span>Tất cả JD</span>
                  </span>
                </button>
                {availableJds.map(([id, jd]) => (
                  <button
                    key={id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={jdFilter === id}
                    className={'referral-jd-option' + (jdFilter === id ? ' is-selected' : '')}
                    onClick={() => onJdFilterChange(id)}
                  >
                    <span className="referral-jd-option-label">
                      <span className={'referral-jd-checkbox' + (jdFilter === id ? ' is-checked' : '')} aria-hidden="true">✓</span>
                      <span>{jd.title}</span>
                    </span>
                    {jd.createdAt ? <time>{formatDate(jd.createdAt)}</time> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </label>
        {source === 'FREELANCER' ? (
          <ReferralFilterDropdown
            label="Tình trạng tài khoản"
            value={accountStatusFilter}
            options={[
              { value: 'ALL', label: 'Tất cả' },
              { value: 'ACTIVE', label: 'Hoạt động' },
              { value: 'INACTIVE', label: 'Đã khóa' },
            ]}
            onChange={onAccountStatusChange}
          />
        ) : null}
      </div>
    </div>
  );
}

interface ReferralPeopleListProps {
  visiblePeople: Array<{ person: ReferralManagementPerson; applications: ReferralManagementApplication[] }>;
  source: ReferralManagementSource;
  copiedIdentifier: string | null;
  onCopyIdentifier: (identifier: string) => void;
  onRequestStatusChange: (person: ReferralManagementPerson) => void;
  expandedIds: Record<string, boolean>;
  onToggleExpanded: (sourceId: string) => void;
}

function ReferralPeopleList({
  visiblePeople,
  source,
  copiedIdentifier,
  onCopyIdentifier,
  onRequestStatusChange,
  expandedIds,
  onToggleExpanded,
}: ReferralPeopleListProps) {
  return (
    <div className="referral-people-list">
      {visiblePeople.map(({ person, applications }) => {
        const isExpanded = Boolean(expandedIds[person.sourceId]);
        const metrics = person.metrics;
        return (
          <article className={'referral-person-card' + (person.isActive ? '' : ' is-inactive')} key={person.sourceId}>
            <div className="referral-person-heading">
              <div className="referral-person-identity">
                <div className="referral-person-name-row">
                  <h3>{person.name || null}</h3>
                  {!person.isActive ? <span className="referral-active-badge is-inactive">Đã khóa</span> : null}
                </div>
                {person.identifier ? (
                  <div className="referral-person-identifier-row">
                    <span className="referral-identifier">
                      <span>{person.identifier}</span>
                      <button
                        type="button"
                        className={'referral-copy-button' + (copiedIdentifier === person.identifier ? ' is-copied' : '')}
                        onClick={() => onCopyIdentifier(person.identifier as string)}
                        title="Sao chép mã Freelancer"
                        aria-label="Sao chép mã Freelancer"
                      >
                        {copiedIdentifier === person.identifier ? 'Đã copy' : <CopyIcon />}
                      </button>
                    </span>
                  </div>
                ) : null}
                <div className="referral-person-meta">
                  <span>{[person.email, person.phone].filter(Boolean).join(' • ')}</span>
                </div>
              </div>
              {source === 'FREELANCER' ? (
                <div className="referral-person-actions">
                  <button
                    type="button"
                    className="referral-status-icon-button"
                    onClick={() => onRequestStatusChange(person)}
                    title={person.isActive ? 'Vô hiệu hóa, giữ lịch sử' : 'Kích hoạt lại'}
                    aria-label={person.isActive ? 'Vô hiệu hóa, giữ lịch sử' : 'Kích hoạt lại'}
                  >
                    {person.isActive ? <UnlockIcon /> : <LockIcon />}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="referral-metrics-grid">
              <Metric label="TỔNG CV GỬI" value={metrics.total} />
              <Metric label="ĐANG XỬ LÝ" value={metrics.processing} />
              <Metric label="ĐÃ ĐẬU" value={metrics.passed} isPositive />
              <Metric label="TỈ LỆ ĐẬU" value={metrics.passRate + '%'} isPositive />
            </div>

            <button
              type="button"
              className="referral-detail-toggle"
              onClick={() => onToggleExpanded(person.sourceId)}
              aria-expanded={isExpanded}
            >
              <span>Chi tiết</span>
              <DetailChevronIcon isOpen={isExpanded} />
            </button>

            {isExpanded ? <ApplicationTable applications={applications} source={source} /> : null}
          </article>
        );
      })}
    </div>
  );
}

interface ReferralPaginationProps {
  page: number;
  visiblePeopleCount: number;
  visibleTotal: number;
  visibleTotalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  onPageChange: (page: number) => void;
}

function ReferralPagination({
  page,
  visiblePeopleCount,
  visibleTotal,
  visibleTotalPages,
  onPrevious,
  onNext,
  onPageChange,
}: ReferralPaginationProps) {
  return (
    <div className="referral-pagination">
      <span>
        Hiển thị {visiblePeopleCount ? (page - 1) * REFERRAL_PAGE_SIZE + 1 : 0}
        {' - '}
        {visiblePeopleCount ? (page - 1) * REFERRAL_PAGE_SIZE + visiblePeopleCount : 0}
        {' của '}
        {visibleTotal} kết quả
      </span>
      <div>
        <button type="button" aria-label="Trang trước" disabled={page <= 1} onClick={onPrevious}>‹</button>
        {buildReferralPaginationPages(page, visibleTotalPages).map((paginationPage, index) => (
          paginationPage === 'ellipsis' ? (
            <span key={'ellipsis-' + index} className="referral-pagination-ellipsis" aria-hidden="true">…</span>
          ) : (
            <button
              key={paginationPage}
              type="button"
              className={paginationPage === page ? 'is-active' : ''}
              aria-current={paginationPage === page ? 'page' : undefined}
              onClick={() => onPageChange(paginationPage)}
            >
              {paginationPage}
            </button>
          )
        ))}
        <button type="button" aria-label="Trang sau" disabled={page >= visibleTotalPages} onClick={onNext}>›</button>
      </div>
    </div>
  );
}

interface ReferralPeopleContentProps {
  loading: boolean;
  error: string | null;
  people: ReferralManagementPerson[];
  filteredPeople: unknown[];
  visiblePeople: Array<{ person: ReferralManagementPerson; applications: ReferralManagementApplication[] }>;
  hasActiveFilter: boolean;
  noMatchingPeopleText: string;
  emptyText: string;
  source: ReferralManagementSource;
  copiedIdentifier: string | null;
  onCopyIdentifier: (identifier: string) => void;
  onRequestStatusChange: (person: ReferralManagementPerson) => void;
  expandedIds: Record<string, boolean>;
  onToggleExpanded: (sourceId: string) => void;
  page: number;
  visibleTotal: number;
  visibleTotalPages: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onPageChange: (page: number) => void;
}

function ReferralPeopleContent({
  loading,
  error,
  people,
  filteredPeople,
  visiblePeople,
  hasActiveFilter,
  noMatchingPeopleText,
  emptyText,
  source,
  copiedIdentifier,
  onCopyIdentifier,
  onRequestStatusChange,
  expandedIds,
  onToggleExpanded,
  page,
  visibleTotal,
  visibleTotalPages,
  onPreviousPage,
  onNextPage,
  onPageChange,
}: ReferralPeopleContentProps) {
  if (loading) return <div className="referral-state">Đang tải danh sách...</div>;
  if (error) return <div className="referral-state is-error">{error}</div>;

  return (
    <>
      {filteredPeople.length === 0 ? (
        <div className="referral-state referral-empty-state">
          {people.length || hasActiveFilter ? noMatchingPeopleText : emptyText}
        </div>
      ) : null}
      {visiblePeople.length > 0 ? (
        <ReferralPeopleList
          visiblePeople={visiblePeople}
          source={source}
          copiedIdentifier={copiedIdentifier}
          onCopyIdentifier={onCopyIdentifier}
          onRequestStatusChange={onRequestStatusChange}
          expandedIds={expandedIds}
          onToggleExpanded={onToggleExpanded}
        />
      ) : null}
      {visibleTotalPages > 1 ? (
        <ReferralPagination
          page={page}
          visiblePeopleCount={visiblePeople.length}
          visibleTotal={visibleTotal}
          visibleTotalPages={visibleTotalPages}
          onPrevious={onPreviousPage}
          onNext={onNextPage}
          onPageChange={onPageChange}
        />
      ) : null}
    </>
  );
}

interface ReferralManagementModalsProps {
  modal: ModalMode;
  source: ReferralManagementSource;
  title: string;
  onClose: () => void;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  name: string;
  setName: React.Dispatch<React.SetStateAction<string>>;
  email: string;
  setEmail: React.Dispatch<React.SetStateAction<string>>;
  phone: string;
  setPhone: React.Dispatch<React.SetStateAction<string>>;
  formError: string | null;
  nameFieldError: string | null;
  emailFieldError: string | null;
  setNameFieldError: React.Dispatch<React.SetStateAction<string | null>>;
  setEmailFieldError: React.Dispatch<React.SetStateAction<string | null>>;
  saving: boolean;
  createdFreelancer: CreatedFreelancerResult | null;
  onCopyCredentials: (result: CreatedFreelancerResult) => void;
  selectedPerson: ReferralManagementPerson | null;
  onConfirmStatusChange: () => void;
}

function ReferralCreateModal({
  source,
  title,
  onClose,
  onSubmit,
  name,
  setName,
  email,
  setEmail,
  phone,
  setPhone,
  formError,
  nameFieldError,
  emailFieldError,
  setNameFieldError,
  setEmailFieldError,
  saving,
}: Pick<ReferralManagementModalsProps, 'source' | 'title' | 'onClose' | 'onSubmit' | 'name' | 'setName' | 'email' | 'setEmail' | 'phone' | 'setPhone' | 'formError' | 'nameFieldError' | 'emailFieldError' | 'setNameFieldError' | 'setEmailFieldError' | 'saving'>) {
  return (
    <div className="referral-modal-backdrop" role="presentation">
      <section className="referral-modal" role="dialog" aria-modal="true" aria-labelledby="referral-create-title">
        <div className="referral-modal-header">
          <h2 id="referral-create-title">Thêm {title} mới</h2>
          <button type="button" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        <form onSubmit={onSubmit} noValidate>
          {source === 'FREELANCER'
            ? (() => (
            <>
              <label>
                <span>HỌ VÀ TÊN <em>*</em></span>
                <div className="referral-input-with-clear">
                  <input value={name} maxLength={255} onChange={(event) => { setName(event.target.value); setNameFieldError(null); }} placeholder="Nhập tên Freelancer mới..." />
                  {name ? <button type="button" className="referral-input-clear-button" onClick={() => { setName(''); setNameFieldError(null); }} aria-label="Xóa họ và tên"><SearchClearIcon /></button> : null}
                </div>
                {nameFieldError ? <div className="referral-field-error">{nameFieldError}</div> : null}
              </label>
              <label>
                <span>EMAIL <em>*</em></span>
                <div className="referral-input-with-clear">
                  <input value={email} maxLength={255} onChange={(event) => { setEmail(event.target.value); setEmailFieldError(null); }} type="email" placeholder="freelancer@gmail.com" />
                  {email ? <button type="button" className="referral-input-clear-button" onClick={() => { setEmail(''); setEmailFieldError(null); }} aria-label="Xóa email"><SearchClearIcon /></button> : null}
                </div>
                {emailFieldError ? <div className="referral-field-error">{emailFieldError}</div> : null}
              </label>
              <label>
                <span>SỐ ĐIỆN THOẠI <em>*</em></span>
                <div className="referral-input-with-clear">
                  <input value={phone} maxLength={50} onChange={(event) => setPhone(event.target.value)} placeholder="0988098797" />
                  {phone ? <button type="button" className="referral-input-clear-button" onClick={() => setPhone('')} aria-label="Xóa số điện thoại"><SearchClearIcon /></button> : null}
                </div>
              </label>
              <div className="referral-identifier-preview">
                <div className="referral-identifier-preview-text">MÃ ĐỊNH DANH SẼ ĐƯỢC CẤP</div>
                <div className="referral-identifier-preview-text">FL-2026-004</div>
                <div className="referral-identifier-preview-text">Gửi mã định danh này cho Freelancer để họ dùng khi nộp CV và đăng nhập theo dõi.</div>
                <div className="referral-identifier-preview-text">Mật khẩu sẽ được gửi đến email được nhập.</div>
              </div>
            </>
            ))()
            : (() => (
            <>
              <label>
                <span>HỌ VÀ TÊN <em>*</em></span>
                <div className="referral-input-with-clear">
                  <input value={name} maxLength={255} onChange={(event) => { setName(event.target.value); setNameFieldError(null); }} placeholder="Nhập họ và tên nhân sự..." />
                  {name ? <button type="button" className="referral-input-clear-button" onClick={() => { setName(''); setNameFieldError(null); }} aria-label="Xóa họ và tên nội bộ"><SearchClearIcon /></button> : null}
                </div>
                {nameFieldError ? <div className="referral-field-error">{nameFieldError}</div> : null}
              </label>
              <label>
                <span>EMAIL NỘI BỘ <em>*</em></span>
                <div className="referral-input-with-clear">
                  <input value={email} maxLength={255} onChange={(event) => { setEmail(event.target.value); setEmailFieldError(null); }} type="email" placeholder="ten.nguoi@viettel.com.vn" />
                  {email ? <button type="button" className="referral-input-clear-button" onClick={() => { setEmail(''); setEmailFieldError(null); }} aria-label="Xóa email Nội bộ"><SearchClearIcon /></button> : null}
                </div>
                {emailFieldError ? <div className="referral-field-error">{emailFieldError}</div> : null}
              </label>
              <label>
                <span>SỐ ĐIỆN THOẠI <em>*</em></span>
                <div className="referral-input-with-clear">
                  <input value={phone} maxLength={50} onChange={(event) => setPhone(event.target.value)} placeholder="0988123456" />
                  {phone ? <button type="button" className="referral-input-clear-button" onClick={() => setPhone('')} aria-label="Xóa số điện thoại nội bộ"><SearchClearIcon /></button> : null}
                </div>
              </label>
            </>
            ))()}
          {formError ? <p className="referral-form-error">{formError}</p> : null}
          <div className="referral-modal-actions">
            <button type="button" className="referral-secondary-button" onClick={onClose}>Hủy</button>
            <button type="submit" className="referral-primary-button" disabled={saving || !email.trim() || !name.trim() || !phone.trim()}>
              {saving ? 'Đang lưu...' : 'Thêm mới'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ReferralCredentialsModal({
  onClose,
  createdFreelancer,
  onCopyCredentials,
}: Pick<ReferralManagementModalsProps, 'onClose' | 'createdFreelancer' | 'onCopyCredentials'>) {
  if (!createdFreelancer) return null;
  return (
    <div className="referral-modal-backdrop" role="presentation">
      <section className="referral-modal" role="dialog" aria-modal="true" aria-labelledby="referral-credentials-title">
        <div className="referral-modal-header">
          <h2 id="referral-credentials-title">Đã thêm Freelancer</h2>
          <button type="button" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        <div className="referral-credentials-body">
          <p>Gửi thông tin dưới đây cho Freelancer để đăng nhập và theo dõi CV.</p>
          <div><span>Mã định danh</span><strong>{createdFreelancer.identifier}</strong></div>
          <div><span>Mật khẩu khởi tạo</span><strong>{createdFreelancer.initialPassword}</strong></div>
          <button type="button" className="referral-primary-button" onClick={() => onCopyCredentials(createdFreelancer)}>
            Sao chép thông tin
          </button>
        </div>
      </section>
    </div>
  );
}

function ReferralStatusModal({
  source,
  onClose,
  formError,
  saving,
  selectedPerson,
  onConfirmStatusChange,
}: Pick<ReferralManagementModalsProps, 'source' | 'onClose' | 'formError' | 'saving' | 'selectedPerson' | 'onConfirmStatusChange'>) {
  if (!selectedPerson) return null;
  const isActive = selectedPerson.isActive;
  const title = isActive ? 'Xác nhận khoá tài khoản Freelancer' : 'Xác nhận mở khoá tài khoản Freelancer';
  const question = isActive ? 'Bạn có chắc muốn vô hiệu hóa nhân sự này không?' : 'Bạn có muốn kích hoạt lại nhân sự này không?';
  const subject = source === 'FREELANCER' ? 'Freelancer' : 'Nhân sự nội bộ';
  const body = isActive
    ? 'bị khóa tài khoản, không thể đăng nhập vào hệ thống.'
    : 'Nhân sự này sẽ có thể tiếp tục được chọn làm nguồn giới thiệu.';

  return (
    <div className="referral-modal-backdrop" role="presentation">
      <section className="referral-modal referral-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="referral-status-title">
        <div className="referral-modal-header">
          <h2 id="referral-status-title">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        <div className="referral-confirm-body">
          <WarningIcon />
          <h3>{question}</h3>
          <p>
            {isActive ? (
              <>
                <strong className="referral-status-subject">{subject}</strong>{' '}
                {body}
              </>
            ) : body}
          </p>
          <strong className="referral-confirm-person">{selectedPerson.name || selectedPerson.email}</strong>
        </div>
        {formError ? <p className="referral-form-error">{formError}</p> : null}
        <div className="referral-modal-actions">
          <button type="button" className="referral-secondary-button" onClick={onClose}>Hủy</button>
          <button type="button" className="referral-primary-button" disabled={saving} onClick={onConfirmStatusChange}>
            {saving ? 'Đang lưu...' : 'Xác nhận'}
          </button>
        </div>
      </section>
    </div>
  );
}

function ReferralManagementModals({
  modal,
  source,
  title,
  onClose,
  onSubmit,
  name,
  setName,
  email,
  setEmail,
  phone,
  setPhone,
  formError,
  nameFieldError,
  emailFieldError,
  setNameFieldError,
  setEmailFieldError,
  saving,
  createdFreelancer,
  onCopyCredentials,
  selectedPerson,
  onConfirmStatusChange,
}: ReferralManagementModalsProps) {
  return (
    <>
      {modal === 'CREATE' ? (
        <ReferralCreateModal
          source={source}
          title={title}
          onClose={onClose}
          onSubmit={onSubmit}
          name={name}
          setName={setName}
          email={email}
          setEmail={setEmail}
          phone={phone}
          setPhone={setPhone}
          formError={formError}
          nameFieldError={nameFieldError}
          emailFieldError={emailFieldError}
          setNameFieldError={setNameFieldError}
          setEmailFieldError={setEmailFieldError}
          saving={saving}
        />
      ) : null}

      {modal === 'CREDENTIALS' ? (
        <ReferralCredentialsModal
          onClose={onClose}
          createdFreelancer={createdFreelancer}
          onCopyCredentials={onCopyCredentials}
        />
      ) : null}

      {modal === 'STATUS' ? (
        <ReferralStatusModal
          source={source}
          onClose={onClose}
          formError={formError}
          saving={saving}
          selectedPerson={selectedPerson}
          onConfirmStatusChange={onConfirmStatusChange}
        />
      ) : null}
    </>
  );
}

export function ReferralManagementPanel({
  source,
  accessToken,
  refreshVersion,
  onNotify,
  loadRecruitmentRounds,
}: ReferralManagementProps) {
  const [people, setPeople] = useState<ReferralManagementPerson[]>([]);
  const [allPeopleForJd, setAllPeopleForJd] = useState<ReferralManagementPerson[]>([]);
  const [jobPostings, setJobPostings] = useState<JobPostingSummary[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: REFERRAL_PAGE_SIZE, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [cvStatusFilter, setCvStatusFilter] = useState<string>('ALL');
  const [cvRoundOptions, setCvRoundOptions] = useState<ReferralRoundOption[]>(() => (
    buildReferralRoundOptions([], source !== 'FREELANCER')
  ));
  const [roundsLoading, setRoundsLoading] = useState(false);
  const [jdFilter, setJdFilter] = useState<JdFilter>('ALL');
  const [isJdFilterOpen, setIsJdFilterOpen] = useState(false);
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
  const [nameFieldError, setNameFieldError] = useState<string | null>(null);
  const [emailFieldError, setEmailFieldError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createdFreelancer, setCreatedFreelancer] = useState<CreatedFreelancerResult | null>(null);
  const [copiedIdentifier, setCopiedIdentifier] = useState<string | null>(null);
  const onNotifyRef = useRef(onNotify);
  const jdDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onNotifyRef.current = onNotify;
  }, [onNotify]);

  useEffect(() => {
    if (!isJdFilterOpen) return undefined;

    function handlePointerDown(event: PointerEvent) {
      if (!jdDropdownRef.current?.contains(event.target as Node)) {
        setIsJdFilterOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isJdFilterOpen]);

  const loadPeople = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getReferralManagementSources(accessToken, source, {
        page,
        limit: REFERRAL_PAGE_SIZE,
        search,
        status: accountStatusFilter === 'ALL' ? undefined : accountStatusFilter,
      });
      setPeople(result.data);
      const resultPagination = result.pagination;
      setPagination(resultPagination ? {
        ...resultPagination,
        page: resultPagination.page ?? page,
        limit: resultPagination.limit || REFERRAL_PAGE_SIZE,
        total: resultPagination.total ?? result.data.length,
        totalPages: resultPagination.totalPages || Math.max(1, Math.ceil((resultPagination.total ?? result.data.length) / (resultPagination.limit || REFERRAL_PAGE_SIZE))),
      } : {
        page,
        limit: REFERRAL_PAGE_SIZE,
        total: result.data.length,
        totalPages: 1,
      });
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

  useEffect(() => {
    let cancelled = false;

    async function loadAllPeopleForJd() {
      try {
        const allPeople: ReferralManagementPerson[] = [];
        let currentPage = 1;
        let totalPages = 1;

        do {
          const result = await getReferralManagementSources(accessToken, source, {
            page: currentPage,
            limit: 100,
          });
          allPeople.push(...result.data);
          totalPages = result.pagination?.totalPages ?? 1;
          currentPage += 1;
        } while (currentPage <= totalPages);

        if (!cancelled) setAllPeopleForJd(allPeople);
      } catch {
        if (!cancelled) setAllPeopleForJd([]);
      }
    }

    void loadAllPeopleForJd();
    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshVersion, source]);

  useEffect(() => {
    let cancelled = false;

    async function loadAllJobPostings() {
      try {
        const allJobPostings: JobPostingSummary[] = [];
        let currentPage = 1;
        let totalPages = 1;

        do {
          const result = await listJobPostings(accessToken, {
            page: currentPage,
            limit: 100,
            status: 'ALL',
            sortBy: 'createdAt',
            sortOrder: 'DESC',
          });
          allJobPostings.push(...result.data);
          totalPages = result.pagination?.totalPages ?? 1;
          currentPage += 1;
        } while (currentPage <= totalPages);

        if (!cancelled) setJobPostings(allJobPostings);
      } catch (loadError) {
        if (!cancelled) {
          setJobPostings([]);
          onNotifyRef.current?.('ERROR', 'Không tải được danh sách JD', getErrorMessage(loadError));
        }
      }
    }

    void loadAllJobPostings();
    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshVersion]);

  const availableJds = useMemo(() => {
    const jdMap = new Map<string, { title: string; createdAt?: string }>();
    jobPostings.forEach((posting) => {
      jdMap.set(posting.jobPostingId, {
        title: posting.jobDescription?.title ?? posting.title,
        createdAt: posting.createdAt,
      });
    });
    [...allPeopleForJd, ...people].forEach((person) => {
      person.applications.forEach((application) => {
        if (!jdMap.has(application.jobPosting.jobPostingId)) {
          jdMap.set(application.jobPosting.jobPostingId, { title: application.jobPosting.title });
        }
      });
    });
    return [...jdMap.entries()].sort((left, right) => {
      const rightTime = right[1].createdAt ? new Date(right[1].createdAt).getTime() : 0;
      const leftTime = left[1].createdAt ? new Date(left[1].createdAt).getTime() : 0;
      return rightTime - leftTime || left[1].title.localeCompare(right[1].title, 'vi');
    });
  }, [allPeopleForJd, jobPostings, people]);
  useEffect(() => {
    if (source !== 'FREELANCER') {
      setCvRoundOptions(buildReferralRoundOptions([], true));
      setRoundsLoading(false);
      return undefined;
    }

    let cancelled = false;

    async function loadRoundsForFilter() {
      setRoundsLoading(true);

      const scopedPostings = jdFilter === 'ALL'
        ? jobPostings
        : jobPostings.filter((posting) => posting.jobPostingId === jdFilter);
      const targets = scopedPostings
        .filter((posting) => posting.jobDescription?.sourceSystem?.toUpperCase() === 'AMIS')
        .map((posting) => ({
          jobPostingId: posting.jobPostingId,
          amisRecruitmentId: posting.jobDescription?.sourceJobId?.trim() ?? '',
        }))
        .filter((target): target is ReferralRoundLoadTarget => Boolean(target.amisRecruitmentId));

      let loadedRounds: ReferralRoundLoadResult[] = [];
      if (loadRecruitmentRounds && targets.length > 0) {
        try {
          loadedRounds = await loadRecruitmentRounds(targets);
        } catch {
          loadedRounds = [];
        }
      }

      const fallbackEntries = allPeopleForJd
        .flatMap((person) => person.applications)
        .filter((application) => jdFilter === 'ALL' || application.jobPosting.jobPostingId === jdFilter)
        .map((application) => application.currentAmisStage)
        .filter((stage): stage is NonNullable<typeof stage> => Boolean(stage?.recruitmentRoundName?.trim()))
        .map((stage) => ({
          id: stage.recruitmentRoundId,
          name: stage.recruitmentRoundName?.trim() ?? '',
          sortOrder: Number.MAX_SAFE_INTEGER,
        }));

      const configuredEntries = loadedRounds.flatMap((result) => result.rounds.map((round) => ({
        id: round.id,
        name: round.name,
        sortOrder: round.sortOrder,
      })));
      const options = buildReferralRoundOptions([...configuredEntries, ...fallbackEntries], false);

      if (!cancelled) {
        setCvRoundOptions(options);
        setRoundsLoading(false);
      }
    }

    void loadRoundsForFilter();
    return () => {
      cancelled = true;
    };
  }, [allPeopleForJd, jdFilter, jobPostings, loadRecruitmentRounds, source]);

  useEffect(() => {
    if (cvStatusFilter === 'ALL' || cvRoundOptions.some((option) => option.value === cvStatusFilter)) return;
    setCvStatusFilter('ALL');
    setPage(1);
  }, [cvRoundOptions, cvStatusFilter]);

  const isClientFilterMode = jdFilter !== 'ALL' || cvStatusFilter !== 'ALL';
  const filteredPeople = useMemo(() => {
    const sourcePeople = isClientFilterMode && allPeopleForJd.length > 0 ? allPeopleForJd : people;
    const normalizedSearch = search.trim().toLocaleLowerCase();

    return sourcePeople
    .filter((person) => (
      !isClientFilterMode
      || accountStatusFilter === 'ALL'
      || (accountStatusFilter === 'ACTIVE' ? person.isActive : !person.isActive)
    ))
    .filter((person) => (
      !normalizedSearch
      || [person.name, person.email, person.identifier]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(normalizedSearch))
    ))
    .map((person) => ({
      person,
      applications: person.applications.filter((application) => (
        (jdFilter === 'ALL' || application.jobPosting.jobPostingId === jdFilter)
        && matchesCvStatus(application, cvStatusFilter, cvRoundOptions)
      )),
    }))
    .filter(({ person, applications }) => (
      applications.length > 0
      || (cvStatusFilter === 'ALL' && jdFilter === 'ALL' && person.applications.length === 0)
    ));
  }, [accountStatusFilter, allPeopleForJd, cvRoundOptions, cvStatusFilter, isClientFilterMode, jdFilter, people, search]);
  const visiblePeople = isClientFilterMode
    ? filteredPeople.slice((page - 1) * REFERRAL_PAGE_SIZE, page * REFERRAL_PAGE_SIZE)
    : filteredPeople;
  const visibleTotal = isClientFilterMode ? filteredPeople.length : pagination.total;
  const visibleTotalPages = isClientFilterMode
    ? Math.max(1, Math.ceil(filteredPeople.length / REFERRAL_PAGE_SIZE))
    : pagination.totalPages;

  function openCreateModal() {
    setName('');
    setEmail('');
    setPhone('');
    setFormError(null);
    setNameFieldError(null);
    setEmailFieldError(null);
    setCreatedFreelancer(null);
    setModal('CREATE');
  }

  function closeModal() {
    if (saving) return;
    setModal(null);
    setSelectedPerson(null);
    setFormError(null);
    setNameFieldError(null);
    setEmailFieldError(null);
    setCreatedFreelancer(null);
  }

  async function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setNameFieldError(null);
    setEmailFieldError(null);
    const normalizedEmail = email.trim().toLowerCase();

    const validationErrors = getCreateFormErrors(source, name, normalizedEmail, phone);
    if (validationErrors) {
      setNameFieldError(validationErrors.nameFieldError ?? null);
      setEmailFieldError(validationErrors.emailFieldError ?? null);
      setFormError(validationErrors.formError ?? null);
      return;
    }

    setSaving(true);
    try {
      if (source === 'FREELANCER') {
        await createFreelancer(accessToken, {
          name: name.trim(),
          email: normalizedEmail,
          phone: phone.trim() || undefined,
        });
        setCreatedFreelancer(null);
        setModal(null);
        onNotify?.('SUCCESS', 'Thành công', 'Đã thêm freelancer thành công');
      } else {
        await createInternal(accessToken, {
          name: name.trim(),
          email: normalizedEmail,
          phone: phone.trim(),
        });
        onNotify?.('SUCCESS', 'Đã thêm Nội bộ', 'Đã thêm nhân sự nội bộ thành công');
        setModal(null);
        setFormError(null);
      }
      setPage(1);
      await loadPeople();
    } catch (createError) {
      if (createError instanceof ApiClientError && createError.code === 'USER_EMAIL_EXISTS') {
        setEmailFieldError('Email này đã có người đăng ký.');
      } else {
        setFormError(getErrorMessage(createError));
      }
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
  const hasActiveFilter = Boolean(search.trim())
    || cvStatusFilter !== 'ALL'
    || jdFilter !== 'ALL'
    || accountStatusFilter !== 'ALL';
  const noMatchingPeopleText = source === 'INTERNAL'
    ? 'Không tìm thấy thông tin NSNB phù hợp'
    : 'Không có CV phù hợp với bộ lọc.';

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
      <ReferralManagementToolbar
        source={source}
        title={title}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onClearSearch={() => {
          setSearch('');
          setPage(1);
        }}
        onCreate={openCreateModal}
        cvStatusFilter={cvStatusFilter}
        cvRoundOptions={cvRoundOptions}
        roundsLoading={roundsLoading}
        onCvStatusChange={(value) => {
          setCvStatusFilter(value as string);
          setPage(1);
        }}
        jdFilter={jdFilter}
        availableJds={availableJds}
        jdDropdownRef={jdDropdownRef}
        isJdFilterOpen={isJdFilterOpen}
        onToggleJdFilter={() => setIsJdFilterOpen((current) => !current)}
        onJdFilterChange={(value) => {
          setJdFilter(value);
          setPage(1);
          setIsJdFilterOpen(false);
        }}
        accountStatusFilter={accountStatusFilter}
        onAccountStatusChange={(value) => {
          setAccountStatusFilter(value as AccountStatusFilter);
          setPage(1);
        }}
      />

      <ReferralPeopleContent
        loading={loading}
        error={error}
        people={people}
        filteredPeople={filteredPeople}
        visiblePeople={visiblePeople}
        hasActiveFilter={hasActiveFilter}
        noMatchingPeopleText={noMatchingPeopleText}
        emptyText={emptyText}
        source={source}
        copiedIdentifier={copiedIdentifier}
        onCopyIdentifier={(identifier) => void copyIdentifier(identifier)}
        onRequestStatusChange={requestStatusChange}
        expandedIds={expandedIds}
        onToggleExpanded={(sourceId) => setExpandedIds((current) => ({
          ...current,
          [sourceId]: !current[sourceId],
        }))}
        page={page}
        visibleTotal={visibleTotal}
        visibleTotalPages={visibleTotalPages}
        onPreviousPage={() => setPage((current) => Math.max(1, current - 1))}
        onNextPage={() => setPage((current) => Math.min(visibleTotalPages, current + 1))}
        onPageChange={setPage}
      />

      <ReferralManagementModals
        modal={modal}
        source={source}
        title={title}
        onClose={closeModal}
        onSubmit={submitCreate}
        name={name}
        setName={setName}
        email={email}
        setEmail={setEmail}
        phone={phone}
        setPhone={setPhone}
        formError={formError}
        nameFieldError={nameFieldError}
        emailFieldError={emailFieldError}
        setNameFieldError={setNameFieldError}
        setEmailFieldError={setEmailFieldError}
        saving={saving}
        createdFreelancer={createdFreelancer}
        onCopyCredentials={(result) => void copyCredentials(result)}
        selectedPerson={selectedPerson}
        onConfirmStatusChange={() => void confirmStatusChange()}
      />
    </div>
  );
}

function Metric({ label, value, isPositive = false }: { label: string; value: number | string; isPositive?: boolean }) {
  return <div className="referral-metric"><span>{label}</span><strong className={isPositive ? 'is-positive' : ''}>{value}</strong></div>;
}

function ApplicationTable({ applications, source }: { applications: ReferralManagementApplication[]; source: ReferralManagementSource }) {
  if (applications.length === 0) return <div className="referral-empty-detail">Chưa tải lên CV nào</div>;

  return (
    <div className="referral-table-wrap">
      <table className="referral-application-table">
        <thead><tr><th>STT</th><th>CV</th><th>JD</th><th>Tình trạng xử lý</th><th>Thời gian nộp CV</th><th>TA quản lý</th><th>{source === 'INTERNAL' ? 'Ghi chú của Nhân sự nội bộ' : 'Ghi chú của Freelancer'}</th></tr></thead>
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

type ReferralRoundEntry = {
  id?: string | null;
  name: string;
  sortOrder?: number | null;
};

function addReferralRoundEntry(
  groupedRounds: Map<string, ReferralRoundOption>,
  entry: ReferralRoundEntry,
) {
  const label = entry.name.trim();
  const normalizedName = normalizeAmisStageName(label);
  if (!label || !normalizedName) return;

  const existing = groupedRounds.get(normalizedName);
  const roundId = entry.id?.trim();
  const sortOrder = Number.isFinite(entry.sortOrder) ? entry.sortOrder as number : Number.MAX_SAFE_INTEGER;
  if (existing) {
    if (roundId && !existing.roundIds.includes(roundId)) existing.roundIds.push(roundId);
    existing.sortOrder = Math.min(existing.sortOrder, sortOrder);
    return;
  }

  groupedRounds.set(normalizedName, {
    value: 'ROUND:' + normalizedName,
    label,
    kind: normalizedName === 'DA TUYEN' ? 'HIRED' : normalizedName === 'LOAI' ? 'REJECTED' : 'ROUND',
    roundIds: roundId ? [roundId] : [],
    normalizedName,
    sortOrder,
  });
}

function addLegacyReferralRoundOptions(groupedRounds: Map<string, ReferralRoundOption>) {
  [
    { name: '\u1ee8ng tuy\u1ec3n', normalizedName: 'UNG TUYEN' },
    { name: 'Thi tuy\u1ec3n', normalizedName: 'THI TUYEN' },
    { name: 'Ph\u1ecfng v\u1ea5n', normalizedName: 'PHONG VAN' },
    { name: 'Offer', normalizedName: 'OFFER' },
  ].forEach((entry, index) => {
    groupedRounds.set(entry.normalizedName, {
      value: 'ROUND:' + entry.normalizedName,
      label: entry.name,
      kind: 'LEGACY_STAGE',
      roundIds: [],
      normalizedName: entry.normalizedName,
      sortOrder: index,
    });
  });
}

function addRequiredReferralStatusOptions(groupedRounds: Map<string, ReferralRoundOption>) {
  if (!groupedRounds.has('DA TUYEN')) {
    groupedRounds.set('DA TUYEN', {
      value: 'STATUS:HIRED',
      label: '\u0110\u00e3 tuy\u1ec3n',
      kind: 'HIRED',
      roundIds: [],
      normalizedName: 'DA TUYEN',
      sortOrder: Number.MAX_SAFE_INTEGER - 1,
    });
  }
  if (!groupedRounds.has('LOAI')) {
    groupedRounds.set('LOAI', {
      value: 'STATUS:REJECTED',
      label: 'Lo\u1ea1i',
      kind: 'REJECTED',
      roundIds: [],
      normalizedName: 'LOAI',
      sortOrder: Number.MAX_SAFE_INTEGER,
    });
  }
}

function buildReferralRoundOptions(
  entries: Array<{ id?: string | null; name: string; sortOrder?: number | null }>,
  includeLegacyStageOptions: boolean,
): ReferralRoundOption[] {
  const groupedRounds = new Map<string, ReferralRoundOption>();

  entries.forEach((entry) => addReferralRoundEntry(groupedRounds, entry));

  if (groupedRounds.size === 0 && includeLegacyStageOptions) {
    addLegacyReferralRoundOptions(groupedRounds);
  }

  addRequiredReferralStatusOptions(groupedRounds);

  return [
    REFERRAL_ALL_ROUNDS_OPTION,
    ...[...groupedRounds.values()].sort((left, right) => (
      left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'vi')
    )),
  ];
}

function matchesCvStatus(
  application: ReferralManagementApplication,
  filter: string,
  options: ReferralRoundOption[],
): boolean {
  if (filter === 'ALL') return true;

  const option = options.find((candidate) => candidate.value === filter);
  if (!option) return false;

  const stageName = normalizeAmisStageName(application.currentAmisStage?.recruitmentRoundName);
  const stageId = application.currentAmisStage?.recruitmentRoundId?.trim();
  if (stageId && option.roundIds.includes(stageId)) return true;
  if (option.normalizedName && option.normalizedName === stageName) return true;
  if (option.kind === 'REJECTED') {
    return application.statusCategory === 'REJECTED' || application.currentAmisStage?.amisStatus === 0;
  }
  if (option.kind === 'HIRED') return application.statusCategory === 'PASSED';
  return false;
}

function buildReferralPaginationPages(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  const safeTotal = Math.max(1, totalPages);
  const safeCurrent = Math.min(Math.max(1, currentPage), safeTotal);

  if (safeTotal <= 7) {
    return Array.from({ length: safeTotal }, (_, index) => index + 1);
  }

  if (safeCurrent <= 2) return [1, 2, 3, 'ellipsis', safeTotal - 1, safeTotal];
  if (safeCurrent === 3) return [2, 3, 4, 'ellipsis', safeTotal - 1, safeTotal];
  if (safeCurrent >= safeTotal - 2) return [1, 2, 'ellipsis', safeTotal - 2, safeTotal - 1, safeTotal];

  return [1, 2, 'ellipsis', safeCurrent - 1, safeCurrent, safeCurrent + 1, 'ellipsis', safeTotal - 1, safeTotal];
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
    .replaceAll('Đ', 'D')
    .replaceAll('đ', 'd')
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

function UnlockIcon() {
  return <svg className="referral-action-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" stroke="#2F2B3D" strokeOpacity="0.9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="16" r="1" stroke="#2F2B3D" strokeOpacity="0.9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M8 11V6C8 3.79086 9.79086 2 12 2C14.20914 2 16 3.79086 16 6" stroke="#2F2B3D" strokeOpacity="0.9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function LockIcon() {
  return <svg className="referral-action-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" stroke="#2F2B3D" strokeOpacity="0.9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="16" r="1" stroke="#2F2B3D" strokeOpacity="0.9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M8 11V7C8 4.79086 9.79086 3 12 3C14.20914 3 16 4.79086 16 7V11" stroke="#2F2B3D" strokeOpacity="0.9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
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
  return <svg className={`referral-detail-chevron${isOpen ? ' is-open' : ''}`} width="6" height="11" viewBox="0 0 6 11" fill="none" aria-hidden="true"><path d="M0.859375 10.8594L5.85938 5.85937C5.90104 5.80729 5.9349 5.7526 5.96094 5.69531C5.98698 5.63802 6 5.57292 6 5.5C6 5.42708 5.98698 5.36198 5.96094 5.30469C5.9349 5.2474 5.90104 5.19271 5.85938 5.14062L0.859375 0.140625C0.807292 0.0989583 0.752604 0.0651042 0.695312 0.0390625C0.638021 0.0130208 0.572917 0 0.5 0C0.364583 0 0.247396 0.0494792 0.148438 0.148437C0.0494792 0.247396 0 0.364583 0 0.5C0 0.572917 0.0130208 0.638021 0.0390625 0.695312C0.0651042 0.752604 0.0989583 0.807292 0.140625 0.859375L4.79688 5.5L0.140625 10.1406C0.0989583 10.1927 0.0651042 10.2474 0.0390625 10.3047C0.0130208 10.362 0 10.4271 0 10.5C0 10.6354 0.0494792 10.7526 0.148438 10.8516C0.247396 10.9505 0.364583 11 0.5 11C0.572917 11 0.638021 10.987 0.695313 10.9609C0.752604 10.9349 0.807292 10.901 0.859375 10.8594Z" fill="white" /></svg>;
}
