import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiClientError,
  createFreelancer,
  createInternal,
  getReferralManagementSources,
  listJobDescriptions,
  listJobPostings,
  updateFreelancerStatus,
  updateInternalStatus,
} from '@/lib/api-client';
import type {
  CreatedFreelancerResult,
  ReferralManagementApplication,
  ReferralManagementPerson,
  ReferralManagementSource,
  JobDescriptionSummary,
  JobPostingSummary,
  AmisRecruitmentRound,
} from '@/types/types';
import {
  buildFreelancerIdentifierCopyText,
  filterReferralApplicationsByDateRange,
  isDateRangeComplete,
  usesDynamicReferralRounds,
} from '@/features/referrals/referral-management-utils';
import { StatsMetricGrid } from '@/components/metrics/StatsMetricGrid';
import { formatDate, toErrorMessage } from '@/lib/utils';
import { DateRangeFilter, FilterDropdown, MultiSelectFilter } from '@/components/filters';
import { InputField } from '@/components/form/InputField';
import {
  ReferralWarningIcon as WarningIcon,
  SearchClearIcon,
  PlusIcon,
} from '@/components/svg';
import { ReferralFilters } from './components/ReferralFilters';
import { ReferralPersonCard } from './components/ReferralPersonCard';

type CvStatusFilter = string;
type JdFilter = string[];
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
  return (
    <FilterDropdown
      label={label}
      value={value}
      options={options}
      isOpen={isOpen}
      onToggle={() => setIsOpen((current) => !current)}
      onClose={() => setIsOpen(false)}
      disabled={disabled}
      onSelect={(nextValue) => {
        onChange(nextValue);
        setIsOpen(false);
      }}
      className="referral-custom-filter referral-filter-dropdown"
      triggerClassName="referral-filter-trigger"
      menuClassName="referral-filter-options"
      optionClassName="referral-filter-option"
    />
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

            <StatsMetricGrid
              ariaLabel="Thống kê CV"
              className="referral-metrics-grid"
              items={[
                { label: 'TỔNG CV GỬI', value: metrics.total },
                { label: 'ĐANG XỬ LÝ', value: metrics.processing },
                { label: 'ĐÃ ĐẬU', value: metrics.passed, accent: true },
                { label: 'TỈ LỆ ĐẬU', value: `${metrics.passRate}%`, accent: true },
              ]}
            />

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

// Kept for the legacy rendering path while the component-based referral UI is active.
void ReferralPeopleContent;

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
  const [jobDescriptions, setJobDescriptions] = useState<JobDescriptionSummary[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: REFERRAL_PAGE_SIZE, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [cvStatusFilter, setCvStatusFilter] = useState<string>('ALL');
  const [cvRoundOptions, setCvRoundOptions] = useState<ReferralRoundOption[]>(() => (
    buildReferralRoundOptions([], !usesDynamicReferralRounds(source))
  ));
  const [roundsLoading, setRoundsLoading] = useState(false);
  const [jdFilter, setJdFilter] = useState<JdFilter>([]);
  const isAllJdSelected = jdFilter.length === 0;
  const [isJdFilterOpen, setIsJdFilterOpen] = useState(false);
  const [dateRangeFilter, setDateRangeFilter] = useState({ from: '', to: '' });
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
  const [phoneFieldError, setPhoneFieldError] = useState<string | null>(null);
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
        limit: REFERRAL_PAGE_SIZE,
        search: search.trim() || undefined,
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

  useEffect(() => {
    let cancelled = false;

    async function loadAllJobDescriptions() {
      try {
        const allJobDescriptions: JobDescriptionSummary[] = [];
        let currentPage = 1;
        let totalPages = 1;

        do {
          const result = await listJobDescriptions(accessToken, {
            page: currentPage,
            limit: 100,
            status: 'ALL',
            latestSyncedOnly: false,
            sortBy: 'createdAt',
            sortOrder: 'DESC',
          });
          allJobDescriptions.push(...result.data);
          totalPages = result.pagination?.totalPages ?? 1;
          currentPage += 1;
        } while (currentPage <= totalPages);

        if (!cancelled) setJobDescriptions(allJobDescriptions);
      } catch {
        if (!cancelled) setJobDescriptions([]);
      }
    }

    void loadAllJobDescriptions();
    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshVersion]);

  const availableJds = useMemo(() => {
    const jdMap = new Map<string, { title: string; createdAt?: string }>();
    const linkedJobDescriptionIds = new Set<string>();
    jobPostings.forEach((posting) => {
      if (posting.jobDescriptionId) linkedJobDescriptionIds.add(posting.jobDescriptionId);
      jdMap.set(posting.jobPostingId, {
        title: posting.jobDescription?.title ?? posting.title,
        createdAt: posting.createdAt,
      });
    });
    jobDescriptions.forEach((jobDescription) => {
      const filterId = `job-description:${jobDescription.id}`;
      if (!linkedJobDescriptionIds.has(jobDescription.id) && !jdMap.has(filterId)) {
        jdMap.set(filterId, {
          title: jobDescription.title,
          createdAt: jobDescription.createdAt,
        });
      }
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
  }, [allPeopleForJd, jobDescriptions, jobPostings, people]);
  const isDateFilterActive = (source === 'FREELANCER' || source === 'INTERNAL')
    && isDateRangeComplete(dateRangeFilter);
  useEffect(() => {
    if (!usesDynamicReferralRounds(source)) {
      setCvRoundOptions(buildReferralRoundOptions([], true));
      setRoundsLoading(false);
      return undefined;
    }

    let cancelled = false;

    async function loadRoundsForFilter() {
      setRoundsLoading(true);

      const scopedPostings = isAllJdSelected
        ? jobPostings
        : jobPostings.filter((posting) => jdFilter.includes(posting.jobPostingId));
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
        .filter((application) => isAllJdSelected || jdFilter.includes(application.jobPosting.jobPostingId))
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
  }, [allPeopleForJd, isAllJdSelected, jdFilter, jobPostings, loadRecruitmentRounds, source]);

  useEffect(() => {
    if (cvStatusFilter === 'ALL' || cvRoundOptions.some((option) => option.value === cvStatusFilter)) return;
    setCvStatusFilter('ALL');
    setPage(1);
  }, [cvRoundOptions, cvStatusFilter]);

  const isClientFilterMode = !isAllJdSelected || cvStatusFilter !== 'ALL' || isDateFilterActive;
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
    .map((person) => {
      const dateFilteredApplications = isDateFilterActive
        ? filterReferralApplicationsByDateRange(person.applications, dateRangeFilter)
        : person.applications;
      const applications = dateFilteredApplications.filter((application) => (
        (isAllJdSelected || jdFilter.includes(application.jobPosting.jobPostingId))
        && matchesCvStatus(application, cvStatusFilter, cvRoundOptions)
      ));

      return {
        person: isClientFilterMode
          ? { ...person, metrics: buildReferralMetrics(applications) }
          : person,
        applications,
      };
    })
    .filter(({ person, applications }) => (
      applications.length > 0
      || (cvStatusFilter === 'ALL' && isAllJdSelected && !isDateFilterActive && person.applications.length === 0)
    ));
  }, [accountStatusFilter, allPeopleForJd, cvRoundOptions, cvStatusFilter, dateRangeFilter, isAllJdSelected, isClientFilterMode, isDateFilterActive, jdFilter, people, search]);
  const visiblePeople = isClientFilterMode
    ? filteredPeople.slice((page - 1) * REFERRAL_PAGE_SIZE, page * REFERRAL_PAGE_SIZE)
    : filteredPeople;
  const visibleTotal = isClientFilterMode ? filteredPeople.length : pagination.total;
  const visibleTotalPages = isClientFilterMode
    ? Math.max(1, Math.ceil(filteredPeople.length / REFERRAL_PAGE_SIZE))
    : pagination.totalPages;

  const nextFreelancerIdentifier = useMemo(() => {
    let maxSeq = 0;
    [...people, ...allPeopleForJd].forEach(({ identifier }) => {
      if (identifier && /^FL-?\d+$/i.test(identifier)) {
        const num = parseInt(identifier.replace(/^FL-?/i, ''), 10);
        if (!Number.isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    });
    const nextSeq = Math.max(maxSeq + 1, (pagination.total ?? 0) + 1);
    return `FL${String(nextSeq).padStart(6, '0')}`;
  }, [people, allPeopleForJd, pagination.total]);

  function openCreateModal() {
    setName('');
    setEmail('');
    setPhone('');
    setFormError(null);
    setNameFieldError(null);
    setEmailFieldError(null);
    setPhoneFieldError(null);
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
    setPhoneFieldError(null);
    setCreatedFreelancer(null);
  }

  async function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setNameFieldError(null);
    setEmailFieldError(null);
    setPhoneFieldError(null);
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
    ? 'Chưa có nhân sự Freelancer nào'
    : 'Chưa có người Nội bộ nào.';
  const hasActiveFilter = Boolean(search.trim())
    || cvStatusFilter !== 'ALL'
    || !isAllJdSelected
    || accountStatusFilter !== 'ALL'
    || isDateFilterActive;
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
    <div className={`referral-management-panel ${source === 'FREELANCER' ? 'is-freelancer' : 'is-internal'}`}>
      <ReferralFilters
        source={source}
        search={search}
        onSearchChange={(value) => {
          setSearch(value.slice(0, 64));
          setPage(1);
        }}
        placeholder={source === 'FREELANCER' ? 'Tìm kiếm theo tên, mã Freelancer' : 'Tìm kiếm theo tên, email, số điện thoại'}
        ariaLabel={`Tìm kiếm ${title}`}
        clearButton={search ? (
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
        action={source === 'FREELANCER' ? (
          <button type="button" className="referral-primary-button" onClick={openCreateModal}>
            <PlusIcon />
            <span>Thêm nhân sự</span>
          </button>
        ) : null}
      >
        <ReferralFilterDropdown
          label="Tình trạng CV"
          value={cvStatusFilter}
          disabled={source === 'FREELANCER' && roundsLoading}
          options={cvRoundOptions.map((option) => ({ value: option.value, label: option.label }))}
          onChange={(value) => {
            setCvStatusFilter(value as CvStatusFilter);
            setPage(1);
          }}
        />
        <MultiSelectFilter
          label="Lọc theo JD"
          allLabel="Tất cả JD"
          values={jdFilter}
          options={availableJds.map(([value, jd]) => ({ value, label: jd.title, meta: jd.createdAt ? (formatDate(jd.createdAt) ?? undefined) : undefined }))}
          isOpen={isJdFilterOpen}
          onToggle={() => setIsJdFilterOpen((current) => !current)}
          onClose={() => setIsJdFilterOpen(false)}
          onChange={(values) => {
            setJdFilter(values);
            setPage(1);
          }}
        />
        {source === 'FREELANCER' ? (
          <ReferralFilterDropdown
            label="Tình trạng tài khoản"
            value={accountStatusFilter}
            options={[
              { value: 'ALL', label: 'Tất cả' },
              { value: 'ACTIVE', label: 'Hoạt động' },
              { value: 'INACTIVE', label: 'Đã khóa' },
            ]}
            onChange={(value) => {
              setAccountStatusFilter(value as AccountStatusFilter);
              setPage(1);
            }}
          />
        ) : null}
        <DateRangeFilter
          label="Thời gian"
          value={dateRangeFilter}
          onChange={(range) => {
            setDateRangeFilter(range);
            setPage(1);
          }}
        />
      </ReferralFilters>

      {loading ? <div className="referral-state">Đang tải danh sách...</div> : null}
      {!loading && error ? <div className="referral-state is-error">{error}</div> : null}
      {!loading && !error && filteredPeople.length === 0 ? (
        <div className="referral-state referral-empty-state">
          {people.length || hasActiveFilter ? noMatchingPeopleText : emptyText}
        </div>
      ) : null}

      {!loading && !error && visiblePeople.length > 0 ? (
        <div className="referral-people-list">
          {visiblePeople.map(({ person, applications }) => (
            <ReferralPersonCard
              key={person.sourceId}
              person={person}
              source={source}
              applications={applications}
              isExpanded={Boolean(expandedIds[person.sourceId])}
              copiedIdentifier={copiedIdentifier}
              isClientFilterMode={isClientFilterMode}
              onToggleExpand={(sourceId) => setExpandedIds((current) => ({ ...current, [sourceId]: !current[sourceId] }))}
              onCopyIdentifier={(identifier) => void copyIdentifier(identifier)}
              onRequestStatusChange={requestStatusChange}
            />
          ))}
        </div>
      ) : null}

      {visibleTotalPages > 1 ? (
        <div className="referral-pagination">
          <span>
            Hiển thị {visiblePeople.length ? (page - 1) * REFERRAL_PAGE_SIZE + 1 : 0}
            {' - '}
            {visiblePeople.length ? (page - 1) * REFERRAL_PAGE_SIZE + visiblePeople.length : 0}
            {' của '}
            {visibleTotal} kết quả
          </span>
          <div>
            <button
              type="button"
              className="referral-page-btn"
              aria-label="Trang trước"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            {buildReferralPaginationPages(page, visibleTotalPages).map((paginationPage, index) => (
              paginationPage === 'ellipsis' ? (
                <span key={`ellipsis-${index}`} className="referral-pagination-ellipsis" aria-hidden="true">…</span>
              ) : (
                <button
                  key={paginationPage}
                  type="button"
                  className={`referral-page-btn${paginationPage === page ? ' is-active' : ''}`}
                  aria-current={paginationPage === page ? 'page' : undefined}
                  onClick={() => setPage(paginationPage)}
                >
                  {paginationPage}
                </button>
              )
            ))}
            <button
              type="button"
              className="referral-page-btn"
              aria-label="Trang sau"
              disabled={page >= visibleTotalPages}
              onClick={() => setPage((current) => Math.min(visibleTotalPages, current + 1))}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>
        </div>
      ) : null}

      {modal === 'CREATE' ? (
        <div className="referral-modal-backdrop" role="presentation">
          <section className="referral-modal" role="dialog" aria-modal="true" aria-labelledby="referral-create-title">
            <div className="referral-modal-header">
              <h2 id="referral-create-title">Thêm {title} mới</h2>
              <button type="button" className="referral-modal-close-btn" onClick={closeModal} aria-label="Đóng">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 1L9 9M9 1L1 9" />
                </svg>
              </button>
            </div>
            <form onSubmit={submitCreate} noValidate>
              {source === 'FREELANCER' ? (
                <>
                  <InputField
                    label="HỌ VÀ TÊN"
                    required
                    value={name}
                    maxLength={255}
                    onChange={(event) => {
                      setName(event.target.value);
                      setNameFieldError(null);
                    }}
                    placeholder="Nhập tên Freelancer mới"
                    error={nameFieldError ?? undefined}
                    trailing={
                      name ? (
                        <button
                          type="button"
                          className="referral-input-clear-button"
                          onClick={() => {
                            setName('');
                            setNameFieldError(null);
                          }}
                          aria-label="Xóa họ và tên"
                        >
                          <SearchClearIcon />
                        </button>
                      ) : null
                    }
                  />
                  <InputField
                    label="EMAIL"
                    required
                    type="email"
                    stripWhitespace
                    value={email}
                    maxLength={255}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setEmailFieldError(null);
                    }}
                    placeholder="Nhập email Freelancer"
                    error={emailFieldError ?? undefined}
                    trailing={
                      email ? (
                        <button
                          type="button"
                          className="referral-input-clear-button"
                          onClick={() => {
                            setEmail('');
                            setEmailFieldError(null);
                          }}
                          aria-label="Xóa email"
                        >
                          <SearchClearIcon />
                        </button>
                      ) : null
                    }
                  />
                  <InputField
                    label="SỐ ĐIỆN THOẠI"
                    required
                    value={phone}
                    maxLength={50}
                    onChange={(event) => {
                      const digitsOnly = event.target.value.replace(/\D/g, '');
                      setPhone(digitsOnly);
                      setPhoneFieldError(null);
                    }}
                    placeholder="Nhập SĐT Freelancer"
                    error={phoneFieldError ?? undefined}
                    trailing={
                      phone ? (
                        <button
                          type="button"
                          className="referral-input-clear-button"
                          onClick={() => {
                            setPhone('');
                            setPhoneFieldError(null);
                          }}
                          aria-label="Xóa số điện thoại"
                        >
                          <SearchClearIcon />
                        </button>
                      ) : null
                    }
                  />
                  <div className="referral-identifier-preview">
                    <div className="referral-identifier-preview-header">MÃ ĐỊNH DANH SẼ ĐƯỢC CẤP</div>
                    <div className="referral-identifier-preview-code">{nextFreelancerIdentifier}</div>
                    <div className="referral-identifier-preview-notes">
                      <span>Gửi mã định danh này cho Freelancer để họ dùng khi nộp CV và đăng nhập theo dõi.</span>
                      <span>Mật khẩu sẽ được gửi đến email được nhập.</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <InputField
                    label="HỌ VÀ TÊN"
                    required
                    value={name}
                    maxLength={255}
                    onChange={(event) => {
                      setName(event.target.value);
                      setNameFieldError(null);
                    }}
                    placeholder="Nhập họ và tên nhân sự..."
                    error={nameFieldError ?? undefined}
                    trailing={
                      name ? (
                        <button
                          type="button"
                          className="referral-input-clear-button"
                          onClick={() => {
                            setName('');
                            setNameFieldError(null);
                          }}
                          aria-label="Xóa họ và tên nội bộ"
                        >
                          <SearchClearIcon />
                        </button>
                      ) : null
                    }
                  />
                  <InputField
                    label="EMAIL NỘI BỘ"
                    required
                    type="email"
                    stripWhitespace
                    value={email}
                    maxLength={255}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setEmailFieldError(null);
                    }}
                    placeholder="ten.nguoi@viettel.com.vn"
                    error={emailFieldError ?? undefined}
                    trailing={
                      email ? (
                        <button
                          type="button"
                          className="referral-input-clear-button"
                          onClick={() => {
                            setEmail('');
                            setEmailFieldError(null);
                          }}
                          aria-label="Xóa email Nội bộ"
                        >
                          <SearchClearIcon />
                        </button>
                      ) : null
                    }
                  />
                  <InputField
                    label="SỐ ĐIỆN THOẠI"
                    required
                    value={phone}
                    maxLength={50}
                    onChange={(event) => {
                      const digitsOnly = event.target.value.replace(/\D/g, '');
                      setPhone(digitsOnly);
                      setPhoneFieldError(null);
                    }}
                    placeholder="0988123456"
                    error={phoneFieldError ?? undefined}
                    trailing={
                      phone ? (
                        <button
                          type="button"
                          className="referral-input-clear-button"
                          onClick={() => {
                            setPhone('');
                            setPhoneFieldError(null);
                          }}
                          aria-label="Xóa số điện thoại nội bộ"
                        >
                          <SearchClearIcon />
                        </button>
                      ) : null
                    }
                  />
                </>
              )}
              {formError ? <p className="referral-form-error">{formError}</p> : null}
              <div className="referral-modal-actions">
                <button type="button" className="referral-modal-cancel-btn" onClick={closeModal}>HỦY</button>
                <button
                  type="submit"
                  className="referral-modal-submit-btn"
                  disabled={saving || !email.trim() || !name.trim() || !phone.trim()}
                >
                  {saving ? 'ĐANG LƯU...' : 'THÊM MỚI'}
                </button>
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
              <button type="button" className="referral-modal-close-btn" onClick={closeModal} aria-label="Đóng">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 1L9 9M9 1L1 9" />
                </svg>
              </button>
            </div>
            <div className="referral-credentials-body">
              <p>Gửi thông tin dưới đây cho Freelancer để đăng nhập và theo dõi CV.</p>
              <div><span>Mã định danh</span><strong>{createdFreelancer.identifier}</strong></div>
              <div><span>Mật khẩu khởi tạo</span><strong>{createdFreelancer.initialPassword}</strong></div>
              <button type="button" className="referral-modal-submit-btn" onClick={() => void copyCredentials(createdFreelancer)}>
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
              <h2 id="referral-status-title">
                {selectedPerson.isActive ? 'Xác nhận khoá tài khoản Freelancer' : 'Xác nhận mở khoá tài khoản Freelancer'}
              </h2>
              <button type="button" className="referral-modal-close-btn" onClick={closeModal} aria-label="Đóng">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 1L9 9M9 1L1 9" />
                </svg>
              </button>
            </div>
            <div className="referral-confirm-body">
              <WarningIcon />
              <h3>{selectedPerson.isActive ? 'Bạn có chắc muốn vô hiệu hóa nhân sự này không?' : 'Bạn có muốn kích hoạt lại nhân sự này không?'}</h3>
              <p>
                {selectedPerson.isActive ? (
                  <>
                    <strong className="referral-status-subject">{source === 'FREELANCER' ? 'Freelancer' : 'Nhân sự nội bộ'}</strong>{' '}
                    bị khóa tài khoản, không thể đăng nhập vào hệ thống.
                  </>
                ) : 'Nhân sự này sẽ có thể tiếp tục được chọn làm nguồn giới thiệu.'}
              </p>
              <strong className="referral-confirm-person">{selectedPerson.name || selectedPerson.email}</strong>
            </div>
            {formError ? <p className="referral-form-error">{formError}</p> : null}
            <div className="referral-modal-actions">
              <button type="button" className="referral-modal-cancel-btn" onClick={closeModal}>HỦY</button>
              <button type="button" className="referral-modal-submit-btn" disabled={saving} onClick={() => void confirmStatusChange()}>{saving ? 'ĐANG LƯU...' : 'XÁC NHẬN'}</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ApplicationTable({ applications, source }: { applications: ReferralManagementApplication[]; source: ReferralManagementSource }) {
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [scrollState, setScrollState] = useState({ scrollLeft: 0, maxScroll: 0, ratio: 0, canScroll: false, thumbWidthPercent: 40 });
  const isDraggingTableRef = useRef(false);
  const isDraggingThumbRef = useRef(false);
  const startXRef = useRef(0);
  const startScrollLeftRef = useRef(0);

  const updateScrollState = useCallback(() => {
    const el = tableWrapRef.current;
    if (!el) return;
    const canScroll = el.scrollWidth > el.clientWidth + 2;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const ratio = maxScroll > 0 ? el.scrollLeft / maxScroll : 0;
    const thumbWidthPercent = el.scrollWidth > 0 ? Math.max(20, Math.min(100, (el.clientWidth / el.scrollWidth) * 100)) : 100;
    setScrollState({
      scrollLeft: el.scrollLeft,
      maxScroll,
      ratio,
      canScroll,
      thumbWidthPercent,
    });
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = tableWrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => updateScrollState());
    observer.observe(el);
    return () => observer.disconnect();
  }, [applications, updateScrollState]);

  if (applications.length === 0) return <div className="referral-empty-detail">Chưa tải lên CV nào</div>;

  function handleScroll() {
    updateScrollState();
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!tableWrapRef.current) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && scrollState.canScroll) {
      tableWrapRef.current.scrollLeft += e.deltaY;
    }
  }

  function handleTableMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!tableWrapRef.current) return;
    isDraggingTableRef.current = true;
    startXRef.current = e.pageX;
    startScrollLeftRef.current = tableWrapRef.current.scrollLeft;
  }

  function handleTableMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!isDraggingTableRef.current || !tableWrapRef.current) return;
    e.preventDefault();
    const deltaX = e.pageX - startXRef.current;
    tableWrapRef.current.scrollLeft = startScrollLeftRef.current - deltaX;
  }

  function handleTableMouseUpOrLeave() {
    isDraggingTableRef.current = false;
  }

  function handleTrackMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!trackRef.current || !tableWrapRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickRatio = Math.max(0, Math.min(1, clickX / rect.width));
    tableWrapRef.current.scrollLeft = clickRatio * scrollState.maxScroll;
  }

  function handleThumbMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
    isDraggingThumbRef.current = true;
    startXRef.current = e.clientX;
    startScrollLeftRef.current = tableWrapRef.current?.scrollLeft ?? 0;

    function handleMouseMove(moveEvent: MouseEvent) {
      if (!isDraggingThumbRef.current || !trackRef.current || !tableWrapRef.current) return;
      const trackWidth = trackRef.current.clientWidth;
      const thumbWidth = (scrollState.thumbWidthPercent / 100) * trackWidth;
      const maxThumbTravel = trackWidth - thumbWidth;
      if (maxThumbTravel <= 0) return;

      const deltaX = moveEvent.clientX - startXRef.current;
      const scrollDelta = (deltaX / maxThumbTravel) * scrollState.maxScroll;
      tableWrapRef.current.scrollLeft = startScrollLeftRef.current + scrollDelta;
    }

    function handleMouseUp() {
      isDraggingThumbRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  const thumbLeftPercent = scrollState.ratio * (100 - scrollState.thumbWidthPercent);

  return (
    <div className="referral-application-table-container">
      <div
        ref={tableWrapRef}
        className="referral-table-wrap"
        onScroll={handleScroll}
        onWheel={handleWheel}
        onMouseDown={handleTableMouseDown}
        onMouseMove={handleTableMouseMove}
        onMouseUp={handleTableMouseUpOrLeave}
        onMouseLeave={handleTableMouseUpOrLeave}
      >
        <table className="referral-application-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>CV</th>
              <th>JD</th>
              <th>Tình trạng xử lý</th>
              <th>Thời gian nộp CV</th>
              <th>TA quản lý</th>
              <th>{source === 'INTERNAL' ? 'Ghi chú của Nhân sự nội bộ' : 'Ghi chú của Freelancer'}</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((application, index) => (
              <tr key={application.applicationId}>
                <td>{String(index + 1).padStart(2, '0')}</td>
                <td>{application.candidate.fullName}</td>
                <td>{application.jobPosting.title}</td>
                <td><StatusPill application={application} /></td>
                <td>{formatDate(application.appliedAt)}</td>
                <td>{application.assignees.map((assignee) => assignee.name).join(', ') || '—'}</td>
                <td>{application.evaluation || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {scrollState.canScroll ? (
        <div className="referral-table-scrollbar-row">
          <div
            ref={trackRef}
            className="referral-custom-scrollbar-track"
            onMouseDown={handleTrackMouseDown}
            role="scrollbar"
            aria-valuenow={Math.round(scrollState.ratio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="referral-custom-scrollbar-thumb"
              style={{
                width: `${scrollState.thumbWidthPercent}%`,
                left: `${thumbLeftPercent}%`,
              }}
              onMouseDown={handleThumbMouseDown}
            />
          </div>
        </div>
      ) : null}
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

  let kind: ReferralRoundOptionKind = 'ROUND';
  if (normalizedName === 'DA TUYEN') {
    kind = 'HIRED';
  } else if (normalizedName === 'LOAI') {
    kind = 'REJECTED';
  }

  groupedRounds.set(normalizedName, {
    value: 'ROUND:' + normalizedName,
    label,
    kind,
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
      label: 'Đã tuyển',
      kind: 'HIRED',
      roundIds: [],
      normalizedName: 'DA TUYEN',
      sortOrder: Number.MAX_SAFE_INTEGER - 1,
    });
  }
  if (!groupedRounds.has('LOAI')) {
    groupedRounds.set('LOAI', {
      value: 'STATUS:REJECTED',
      label: 'Loại',
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

function buildReferralMetrics(applications: ReferralManagementApplication[]) {
  const passed = applications.filter((application) => application.statusCategory === 'PASSED').length;

  return {
    total: applications.length,
    processing: applications.filter((application) => application.statusCategory === 'PROCESSING').length,
    passed,
    passRate: applications.length > 0 ? Math.round((passed / applications.length) * 100) : 0,
  };
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

function getErrorMessage(error: unknown): string {
  return toErrorMessage(error);
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

function UnlockIcon() {
  return <svg className="referral-action-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" /><circle cx="12" cy="16" r="1" stroke="currentColor" strokeWidth="1.5" /><path d="M8 11V6C8 3.79 9.79 2 12 2C14.21 2 16 3.79 16 6" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

function LockIcon() {
  return <svg className="referral-action-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" /><circle cx="12" cy="16" r="1" stroke="currentColor" strokeWidth="1.5" /><path d="M8 11V7C8 4.79 9.79 3 12 3C14.21 3 16 4.79 16 7V11" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

function CopyIcon() {
  return <svg className="referral-copy-icon" aria-hidden="true" viewBox="0 0 16 16" fill="none"><rect x="5.2" y="4.4" width="7.2" height="8.2" rx="1.1" stroke="currentColor" strokeWidth="1.2" /><path d="M3.6 10.2H3a1 1 0 0 1-1-1V3.6a1 1 0 0 1 1-1h5.6a1 1 0 0 1 1 1v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>;
}

function DetailChevronIcon({ isOpen }: { isOpen: boolean }) {
  return <svg className={`referral-detail-chevron${isOpen ? ' is-open' : ''}`} width="6" height="11" viewBox="0 0 6 11" fill="none" aria-hidden="true"><path d="M0.86 10.86 5.86 5.86 0.86 0.14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
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

async function copyCredentials(result: CreatedFreelancerResult) {
  await navigator.clipboard?.writeText(`Mã định danh: ${result.identifier}\nMật khẩu: ${result.initialPassword}`);
}
