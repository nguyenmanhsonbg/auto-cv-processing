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
import { buildFreelancerIdentifierCopyText } from '@/features/referrals/referral-management-utils';
import { formatDate, toErrorMessage } from '@/lib/utils';
import { DateRangeFilter, type DateRangeValue, FilterDropdown, MultiSelectFilter } from '@/components/filters';
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

const INTERNAL_EMAIL_PATTERN = /^[^\s@]+@viettel\.com\.vn$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
  const [cvStatusFilter, setCvStatusFilter] = useState<CvStatusFilter>('ALL');
  const [cvRoundOptions, setCvRoundOptions] = useState<ReferralRoundOption[]>(() => (
    buildReferralRoundOptions([], source !== 'FREELANCER')
  ));
  const [roundsLoading, setRoundsLoading] = useState(false);
  const [jdFilter, setJdFilter] = useState<JdFilter>([]);
  const isAllJdSelected = jdFilter.length === 0;
  const [isJdFilterOpen, setIsJdFilterOpen] = useState(false);
  const [accountStatusFilter, setAccountStatusFilter] = useState<AccountStatusFilter>('ALL');
  const [dateRange, setDateRange] = useState<DateRangeValue>({ from: '', to: '' });
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
  useEffect(() => {
    if (source !== 'FREELANCER') {
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

  function matchesDateRange(appliedAt: string | undefined, range: DateRangeValue): boolean {
    if (!range.from && !range.to) return true;
    if (!appliedAt) return false;

    const appliedDate = new Date(appliedAt);
    if (Number.isNaN(appliedDate.getTime())) return false;

    const appliedIsoDate = `${appliedDate.getFullYear()}-${String(appliedDate.getMonth() + 1).padStart(2, '0')}-${String(appliedDate.getDate()).padStart(2, '0')}`;

    if (range.from && range.to) {
      const start = range.from <= range.to ? range.from : range.to;
      const end = range.from <= range.to ? range.to : range.from;
      return appliedIsoDate >= start && appliedIsoDate <= end;
    }
    if (range.from) {
      return appliedIsoDate >= range.from;
    }
    if (range.to) {
      return appliedIsoDate <= range.to;
    }
    return true;
  }

  const isClientFilterMode = !isAllJdSelected || cvStatusFilter !== 'ALL' || Boolean(dateRange.from || dateRange.to);
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
          (isAllJdSelected || jdFilter.includes(application.jobPosting.jobPostingId))
          && matchesCvStatus(application, cvStatusFilter, cvRoundOptions)
          && matchesDateRange(application.appliedAt, dateRange)
        )),
      }))
      .filter(({ person, applications }) => (
        applications.length > 0
        || (cvStatusFilter === 'ALL' && isAllJdSelected && !dateRange.from && !dateRange.to && person.applications.length === 0)
      ));
  }, [accountStatusFilter, allPeopleForJd, cvRoundOptions, cvStatusFilter, dateRange, isAllJdSelected, isClientFilterMode, jdFilter, people, search]);
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

    if (source === 'FREELANCER') {
      if (!name.trim()) {
        setNameFieldError('Họ và tên là bắt buộc, không được để trống.');
        return;
      }
      if (!normalizedEmail) {
        setEmailFieldError('Email không hợp lệ. Vui lòng kiểm tra lại.');
        return;
      }
      if (!EMAIL_PATTERN.test(normalizedEmail)) {
        setEmailFieldError('Email không hợp lệ. Vui lòng kiểm tra lại.');
        return;
      }
      if (!phone.trim()) {
        setPhoneFieldError('Vui lòng nhập số điện thoại Freelancer.');
        return;
      }
    } else {
      if (!name.trim()) {
        setNameFieldError('Họ và tên là bắt buộc, không được để trống.');
        return;
      }
      if (!normalizedEmail || !EMAIL_PATTERN.test(normalizedEmail)) {
        setEmailFieldError('Email không hợp lệ. Vui lòng kiểm tra lại.');
        return;
      }
      if (!INTERNAL_EMAIL_PATTERN.test(normalizedEmail)) {
        setEmailFieldError('Email Nội bộ phải có đuôi @viettel.com.vn.');
        return;
      }
      if (!phone.trim()) {
        setPhoneFieldError('Vui lòng nhập số điện thoại nhân sự nội bộ.');
        return;
      }
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
    || !isAllJdSelected
    || accountStatusFilter !== 'ALL'
    || Boolean(dateRange.from || dateRange.to);
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
      <ReferralFilters
        source={source}
        search={search}
        onSearchChange={(value) => {
          setSearch(value.trim().slice(0, 64));
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
          value={dateRange}
          onChange={(range) => {
            setDateRange(range);
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

function buildReferralRoundOptions(
  entries: Array<{ id?: string | null; name: string; sortOrder?: number | null }>,
  includeLegacyStageOptions: boolean,
): ReferralRoundOption[] {
  const groupedRounds = new Map<string, ReferralRoundOption>();

  for (const entry of entries) {
    const label = entry.name.trim();
    const normalizedName = normalizeAmisStageName(label);
    if (!label || !normalizedName) continue;

    const existing = groupedRounds.get(normalizedName);
    const roundId = entry.id?.trim();
    const sortOrder = Number.isFinite(entry.sortOrder) ? entry.sortOrder as number : Number.MAX_SAFE_INTEGER;
    if (existing) {
      if (roundId && !existing.roundIds.includes(roundId)) existing.roundIds.push(roundId);
      existing.sortOrder = Math.min(existing.sortOrder, sortOrder);
      continue;
    }

    groupedRounds.set(normalizedName, {
      value: `ROUND:${normalizedName}`,
      label,
      kind: normalizedName === 'DA TUYEN' ? 'HIRED' : normalizedName === 'LOAI' ? 'REJECTED' : 'ROUND',
      roundIds: roundId ? [roundId] : [],
      normalizedName,
      sortOrder,
    });
  }

  if (groupedRounds.size === 0 && includeLegacyStageOptions) {
    [
      { name: 'Ứng tuyển', normalizedName: 'UNG TUYEN' },
      { name: 'Thi tuyển', normalizedName: 'THI TUYEN' },
      { name: 'Phỏng vấn', normalizedName: 'PHONG VAN' },
      { name: 'Offer', normalizedName: 'OFFER' },
    ].forEach((entry, index) => {
      groupedRounds.set(entry.normalizedName, {
        value: `ROUND:${entry.normalizedName}`,
        label: entry.name,
        kind: 'LEGACY_STAGE',
        roundIds: [],
        normalizedName: entry.normalizedName,
        sortOrder: index,
      });
    });
  }

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

  return [
    REFERRAL_ALL_ROUNDS_OPTION,
    ...[...groupedRounds.values()].sort((left, right) => (
      left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'vi')
    )),
  ];
}

function matchesCvStatus(
  application: ReferralManagementApplication,
  filter: CvStatusFilter,
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

function normalizeAmisStageName(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .trim();
}

async function copyCredentials(result: CreatedFreelancerResult) {
  await navigator.clipboard?.writeText(`Mã định danh: ${result.identifier}\nMật khẩu: ${result.initialPassword}`);
}


