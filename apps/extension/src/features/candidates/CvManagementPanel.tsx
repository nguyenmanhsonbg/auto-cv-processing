import React from 'react';
import type {
  AmisApplicationsForRecruitment,
  AmisAutoSyncState,
  AmisJobSnapshot,
  AmisRecruitmentRound,
  ExtensionSyncResponse,
  JobDescriptionSummary,
} from '@/types/types';
import {
  BackIcon,
  ChevronRightIcon,
  CloseIcon,
  RefreshIcon,
} from '@/components/icons';
import { FilterDropdown } from '@/components/filters';
import {
  CandidateCard,
  canUploadApplicationCv,
  getApplicationMatchScore,
  getApplicationQuestionStatus,
  getCvSourceFilterBucket,
  type ExtensionApplication,
} from '@/components/candidates';

export type WorkspaceTab = 'overview' | 'posting' | 'cv' | 'freelancer' | 'internal';
export type ApplicationsState = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';
export type CvWorkspaceView = 'overview' | 'list';
export type CvQuestionFilter = 'ALL' | 'ANSWERED' | 'NOT_ANSWERED';
export type CvSyncFilter = 'ALL' | 'AMIS_SYNCED' | 'AMIS_NOT_SYNCED';
export type CvEvaluationFilter = 'ALL' | 'NOT_EVALUATED' | 'EVALUATION_NOT_UPLOADED' | 'EVALUATION_UPLOADED';
export type CvSourceFilter = 'ALL' | 'FACEBOOK' | 'VCS_PORTAL' | 'FREELANCER' | 'INTERNAL';
export type CvSortMode = 'APPLIED_DESC' | 'APPLIED_ASC' | 'SCORE_DESC' | 'SCORE_ASC';
export type CvFilterType = 'QUESTION' | 'SYNC' | 'EVALUATION' | 'SOURCE' | 'SORT';
export type CvStatusFilter = 'PASSED' | 'REVIEW' | 'FAILED';
export type CvSyncStatusBucket = 'SYNCED' | 'NOT_SYNCED' | 'ERROR';

export const CV_APPLICATION_PAGE_SIZE = 5;

export const CV_QUESTION_FILTER_OPTIONS: Array<{ value: CvQuestionFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'NOT_ANSWERED', label: 'Chưa trả lời' },
  { value: 'ANSWERED', label: 'Đã trả lời' },
];

export const CV_SYNC_FILTER_OPTIONS: Array<{ value: CvSyncFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'AMIS_NOT_SYNCED', label: 'Chưa đồng bộ' },
  { value: 'AMIS_SYNCED', label: 'Đã đồng bộ' },
];

export const CV_EVALUATION_FILTER_OPTIONS: Array<{ value: CvEvaluationFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'NOT_EVALUATED', label: 'Chưa đánh giá bằng AI' },
  { value: 'EVALUATION_NOT_UPLOADED', label: 'Chưa tải lên file đánh giá' },
  { value: 'EVALUATION_UPLOADED', label: 'Đã tải lên file đánh giá' },
];

export const CV_SORT_OPTIONS: Array<{ value: CvSortMode; label: string }> = [
  { value: 'APPLIED_DESC', label: 'Mới nhất' },
  { value: 'APPLIED_ASC', label: 'Cũ nhất' },
  { value: 'SCORE_DESC', label: 'Điểm cao đến thấp' },
  { value: 'SCORE_ASC', label: 'Điểm thấp đến cao' },
];

export const CV_SOURCE_FILTER_OPTIONS: Array<{ value: CvSourceFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'VCS_PORTAL', label: 'VCS Portal' },
  { value: 'FREELANCER', label: 'Freelancer' },
  { value: 'INTERNAL', label: 'Nội bộ' },
];

export type CvManagementPanelProps = {
  token: string | null;
  amisRecruitmentId: string | null;
  applicationsContext: AmisApplicationsForRecruitment | null;
  applicationsState: ApplicationsState;
  applicationsMessage: string | null;
  result: ExtensionSyncResponse | null;
  snapshot: AmisJobSnapshot | null;
  autoSyncState: AmisAutoSyncState | null;
  selectedJobDescription: JobDescriptionSummary | null;
  activeAmisCandidateId: string | null;
  isAmisCandidateFormOpen: boolean;
  amisRecruitmentRounds: AmisRecruitmentRound[];
  pendingAmisUploadApplicationIds: Set<string>;
  aiEvaluationUploadedApplicationIds: Set<string>;
  cvUploadApplicationId: string | null;
  aiScreeningApplicationId: string | null;
  aiEvaluationApplicationId: string | null;
  onSelectWorkspaceTab: (tab: WorkspaceTab) => void;
  onLoadAmisApplications: (token: string | null, amisRecruitmentId: string | null) => Promise<void>;
  onLoadSelectedJobDescriptionQuestionSet: (
    selectedJobDescription: JobDescriptionSummary,
    token: string | null,
    options?: { force?: boolean },
  ) => Promise<void>;
  onUploadApplicationCvToAmisForm: (application: ExtensionApplication) => void;
  onUploadApplicationCvsToAmisForm: (applications: ExtensionApplication[]) => void;
  onRunAiScreeningForApplication: (application: ExtensionApplication) => void;
  onUploadAiEvaluationToAmis: (application: ExtensionApplication) => void;
};

export function CvManagementPanel({
  token,
  amisRecruitmentId,
  applicationsContext,
  applicationsState,
  applicationsMessage,
  result,
  snapshot,
  autoSyncState,
  selectedJobDescription,
  activeAmisCandidateId,
  isAmisCandidateFormOpen,
  amisRecruitmentRounds,
  pendingAmisUploadApplicationIds,
  aiEvaluationUploadedApplicationIds,
  cvUploadApplicationId,
  aiScreeningApplicationId,
  aiEvaluationApplicationId,
  onSelectWorkspaceTab,
  onLoadAmisApplications,
  onLoadSelectedJobDescriptionQuestionSet,
  onUploadApplicationCvToAmisForm,
  onUploadApplicationCvsToAmisForm,
  onRunAiScreeningForApplication,
  onUploadAiEvaluationToAmis,
}: CvManagementPanelProps) {
  const [cvWorkspaceView, setCvWorkspaceView] = React.useState<CvWorkspaceView>('overview');
  const [cvQuestionFilter, setCvQuestionFilter] = React.useState<CvQuestionFilter>('ALL');
  const [cvSyncFilter, setCvSyncFilter] = React.useState<CvSyncFilter>('ALL');
  const [cvEvaluationFilter, setCvEvaluationFilter] = React.useState<CvEvaluationFilter>('ALL');
  const [cvSourceFilter, setCvSourceFilter] = React.useState<CvSourceFilter>('ALL');
  const [cvSortMode, setCvSortMode] = React.useState<CvSortMode>('APPLIED_DESC');
  const [cvApplicationPage, setCvApplicationPage] = React.useState(1);
  const [openCvFilter, setOpenCvFilter] = React.useState<CvFilterType | null>(null);
  const [selectedCvApplicationIds, setSelectedCvApplicationIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    setSelectedCvApplicationIds(new Set());
    setCvApplicationPage(1);
    setCvQuestionFilter('ALL');
    setCvSyncFilter('ALL');
    setCvEvaluationFilter('ALL');
    setCvSourceFilter('ALL');
    setCvSortMode('APPLIED_DESC');
    setOpenCvFilter(null);
  }, [amisRecruitmentId, token]);

  React.useEffect(() => {
    if (!applicationsContext) return;
    const currentIds = new Set(applicationsContext.applications.map((application) => application.applicationId));
    setSelectedCvApplicationIds((current) =>
      new Set(Array.from(current).filter((applicationId) => currentIds.has(applicationId))),
    );
  }, [applicationsContext]);

  React.useEffect(() => {
    if (!openCvFilter) return undefined;

    const closeWhenClickingOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.cv-filter-dropdown')) {
        setOpenCvFilter(null);
      }
    };

    document.addEventListener('pointerdown', closeWhenClickingOutside);
    return () => document.removeEventListener('pointerdown', closeWhenClickingOutside);
  }, [openCvFilter]);

  function onToggleCvCandidateSelection(applicationId: string) {
    setSelectedCvApplicationIds((current) => {
      const next = new Set(current);
      if (next.has(applicationId)) {
        next.delete(applicationId);
      } else {
        next.add(applicationId);
      }
      return next;
    });
  }

  function onToggleAllCvCandidateSelection(applicationIds: string[]) {
    if (applicationIds.length === 0) return;

    setSelectedCvApplicationIds((current) => {
      const next = new Set(current);
      const shouldSelectAll = applicationIds.some((applicationId) => !next.has(applicationId));

      for (const applicationId of applicationIds) {
        if (shouldSelectAll) next.add(applicationId);
        else next.delete(applicationId);
      }

      return next;
    });
  }
  return (
    <div className="cv-panel-content">
      {cvWorkspaceView === 'overview' ? renderCvOverviewPanel() : null}
      {cvWorkspaceView === 'list' ? renderCvCandidateListPanel() : null}
    </div>
  );

  function renderCvOverviewPanel() {
    const applications = applicationsContext?.applications ?? [];
    const stats = getCvOverviewStats(applications);
    const currentJobPostingId = result?.amisRecruitmentId === amisRecruitmentId
      ? result.jobPostingId
      : applicationsContext?.amisRecruitmentId === amisRecruitmentId
        ? applicationsContext.jobPostingId
        : null;
    const currentJobTitle = snapshot?.title
      ?? (amisRecruitmentId ? `AMIS recruitment ${amisRecruitmentId}` : 'Chưa chọn tin tuyển dụng');
    const hasCurrentJobMapping = Boolean(snapshot || currentJobPostingId);
    const publicUrl = currentJobPostingId
      ? `http://localhost:4000/public/job-postings/${currentJobPostingId}`
      : snapshot
        ? `https://vcs-portal.vn/jobs/${slugifyForDisplay(snapshot.title)}`
        : '-';

    return (
      <section className="cv-overview-screen">
        <div className="cv-back-title">
          <button type="button" className="cv-back-button" aria-label="Back">
            <CloseIcon />
          </button>
          <h3>Hồ sơ ứng tuyển</h3>
        </div>

        <section className="cv-current-job-card">
          <p className="cv-card-label">Current job</p>
          <div className="cv-job-title-row">
            <h4>{currentJobTitle}</h4>
            <span className={hasCurrentJobMapping ? 'cv-mini-badge is-success' : 'cv-mini-badge is-muted'}>
              {hasCurrentJobMapping ? 'Mapped' : 'No job'}
            </span>
          </div>
          <dl>
            <div>
              <dt>AMIS ID</dt>
              <dd>{amisRecruitmentId ?? '-'}</dd>
            </div>
            <div>
              <dt>Public URL</dt>
              <dd className="cv-public-url">{publicUrl}</dd>
            </div>
            <div>
              <dt>Last synced</dt>
              <dd>{autoSyncState?.updatedAt ?? '-'}</dd>
            </div>
          </dl>
        </section>

        <section className="cv-overview-block">
          <p className="cv-section-label">Application overview</p>
          <div className="cv-stat-grid">
            <article>
              <strong>{stats.totalApplied}</strong>
              <span>Total applied</span>
              <small>Tổng hồ sơ đã apply</small>
            </article>
            <article className="is-success">
              <strong>{stats.newCount}</strong>
              <span>New</span>
              <small>Chưa được HR xử lý</small>
            </article>
            <article className="is-warning">
              <strong>{stats.processingCount}</strong>
              <span>Processing</span>
              <small>Đang scan / parse CV</small>
            </article>
            <article className="is-danger">
              <strong>{stats.syncErrorCount}</strong>
              <span>Sync error</span>
              <small>Cần retry đồng bộ AMIS</small>
            </article>
          </div>
        </section>

        <section className="cv-overview-block">
          <p className="cv-section-label">Job status</p>
          <div className="cv-job-status-list">
            <span>JD Sync <strong className={hasCurrentJobMapping ? 'is-success' : 'is-warning'}>{hasCurrentJobMapping ? 'Synced' : 'Pending'}</strong></span>
            <span>CV Intake <strong className={stats.totalApplied > 0 ? 'is-success' : 'is-warning'}>{stats.totalApplied > 0 ? 'Active' : 'Waiting'}</strong></span>
            <span>CV Processing <strong className={stats.processingCount > 0 ? 'is-warning' : 'is-success'}>{stats.processingCount > 0 ? `${stats.processingCount} Pending` : 'Ready'}</strong></span>
            <span>AMIS Candidate Sync <strong className={stats.syncErrorCount > 0 ? 'is-danger' : 'is-warning'}>{stats.syncErrorCount > 0 ? `${stats.syncErrorCount} Failed` : 'Not synced'}</strong></span>
          </div>
        </section>

        {applicationsMessage ? (
          <p className={applicationsState === 'ERROR' ? 'error-text' : 'muted-text'}>{applicationsMessage}</p>
        ) : null}

        <div className="cv-overview-actions">
          <button
            type="button"
            className="secondary-action-button"
            disabled={!amisRecruitmentId || applicationsState === 'LOADING'}
            onClick={() => void onLoadAmisApplications(token, amisRecruitmentId)}
          >
            Refresh
          </button>
          <a className="secondary-action-button" href={publicUrl === '-' ? undefined : publicUrl} target="_blank" rel="noreferrer">
            View public job
          </a>
          <button type="button" className="secondary-action-button" onClick={() => onSelectWorkspaceTab('posting')}>
            Sync JD
          </button>
          <button
            type="button"
            className="secondary-action-button"
            disabled={!selectedJobDescription}
            onClick={() => {
              if (selectedJobDescription) {
                void onLoadSelectedJobDescriptionQuestionSet(selectedJobDescription, token, { force: true });
              }
            }}
          >
            View question set
          </button>
        </div>

        <button type="button" className="cv-primary-action" onClick={() => setCvWorkspaceView('list')}>
          Open applied candidates
        </button>
      </section>
    );
  }

  function renderCvCandidateListPanel() {
    const applications = applicationsContext?.applications ?? [];
    const applicationsForCurrentAmisCandidate = activeAmisCandidateId
      ? applications.filter((application) => application.amisCandidateId === activeAmisCandidateId)
      : applications;
    const filteredApplications = getVisibleCvApplications(
      applicationsForCurrentAmisCandidate,
      cvQuestionFilter,
      cvSyncFilter,
      cvEvaluationFilter,
      cvSourceFilter,
      cvSortMode,
      aiEvaluationUploadedApplicationIds,
    );
    const totalPages = Math.max(1, Math.ceil(filteredApplications.length / CV_APPLICATION_PAGE_SIZE));
    const currentPage = Math.min(cvApplicationPage, totalPages);
    const pageStartIndex = (currentPage - 1) * CV_APPLICATION_PAGE_SIZE;
    const pageApplications = filteredApplications.slice(pageStartIndex, pageStartIndex + CV_APPLICATION_PAGE_SIZE);
    const selectedFilteredApplications = filteredApplications.filter((application) => selectedCvApplicationIds.has(application.applicationId));
    const selectedFilteredUploadableCount = selectedFilteredApplications.filter((application) =>
      canUploadApplicationCv(application)
      && !pendingAmisUploadApplicationIds.has(application.applicationId),
    ).length;
    const allFilteredApplicationsSelected = filteredApplications.length > 0
      && selectedFilteredApplications.length === filteredApplications.length;
    const someFilteredApplicationsSelected = selectedFilteredApplications.length > 0 && !allFilteredApplicationsSelected;
    const visibleStart = filteredApplications.length === 0 ? 0 : pageStartIndex + 1;
    const visibleEnd = Math.min(pageStartIndex + pageApplications.length, filteredApplications.length);
    const paginationPages = getPaginationPages(currentPage, totalPages);
    const toggleAllCvCandidateSelection = onToggleAllCvCandidateSelection;

    return (
      <section className="cv-list-screen">
        <div className="cv-filter-control-grid">
          <FilterDropdown
            label="Trạng thái trả lời câu hỏi"
            value={cvQuestionFilter}
            options={CV_QUESTION_FILTER_OPTIONS}
            isOpen={openCvFilter === 'QUESTION'}
            onToggle={() => setOpenCvFilter(openCvFilter === 'QUESTION' ? null : 'QUESTION')}
            onSelect={(value) => {
              setCvQuestionFilter(value);
              setCvApplicationPage(1);
              setOpenCvFilter(null);
            }}
          />
          <FilterDropdown
            label="Trạng thái đồng bộ Amis"
            value={cvSyncFilter}
            options={CV_SYNC_FILTER_OPTIONS}
            isOpen={openCvFilter === 'SYNC'}
            onToggle={() => setOpenCvFilter(openCvFilter === 'SYNC' ? null : 'SYNC')}
            onSelect={(value) => {
              setCvSyncFilter(value);
              setCvApplicationPage(1);
              setOpenCvFilter(null);
            }}
          />
          <FilterDropdown
            label="Trạng thái tải file đánh giá"
            value={cvEvaluationFilter}
            options={CV_EVALUATION_FILTER_OPTIONS}
            isOpen={openCvFilter === 'EVALUATION'}
            onToggle={() => setOpenCvFilter(openCvFilter === 'EVALUATION' ? null : 'EVALUATION')}
            onSelect={(value) => {
              setCvEvaluationFilter(value);
              setCvApplicationPage(1);
              setOpenCvFilter(null);
            }}
          />
        </div>
        <div className="cv-filter-control-grid cv-filter-control-grid-secondary">
          <FilterDropdown
            label="Nguồn"
            value={cvSourceFilter}
            options={CV_SOURCE_FILTER_OPTIONS}
            isOpen={openCvFilter === 'SOURCE'}
            onToggle={() => setOpenCvFilter(openCvFilter === 'SOURCE' ? null : 'SOURCE')}
            onSelect={(value) => {
              setCvSourceFilter(value);
              setCvApplicationPage(1);
              setOpenCvFilter(null);
            }}
          />
          <FilterDropdown
            label="Sắp xếp"
            value={cvSortMode}
            options={CV_SORT_OPTIONS}
            isOpen={openCvFilter === 'SORT'}
            onToggle={() => setOpenCvFilter(openCvFilter === 'SORT' ? null : 'SORT')}
            onSelect={(value) => {
              setCvSortMode(value);
              setCvApplicationPage(1);
              setOpenCvFilter(null);
            }}
          />
        </div>
        <div className="cv-list-toolbar">
          <div className="cv-list-toolbar-heading">
            <span>Danh sách ứng viên</span>
            <button
              type="button"
              className="cv-bulk-sync-button"
              disabled={selectedFilteredUploadableCount === 0 || Boolean(cvUploadApplicationId)}
              onClick={() => void onUploadApplicationCvsToAmisForm(selectedFilteredApplications)}
            >
              <RefreshIcon />
              {cvUploadApplicationId === 'BATCH' ? 'Đang đồng bộ...' : 'Đồng bộ CV đã chọn'}
            </button>
          </div>
          {filteredApplications.length > 0 ? (
            <label className="cv-select-all-control">
              <input
                type="checkbox"
                checked={allFilteredApplicationsSelected}
                ref={(input) => {
                  if (input) input.indeterminate = someFilteredApplicationsSelected;
                }}
                aria-label="Chọn tất cả ứng viên"
                onChange={() => toggleAllCvCandidateSelection(filteredApplications.map((application) => application.applicationId))}
              />
              <span>Chọn tất cả ứng viên</span>
            </label>
          ) : null}
        </div>

        {applicationsMessage ? (
          <p className={applicationsState === 'ERROR' ? 'error-text' : 'muted-text'}>{applicationsMessage}</p>
        ) : null}

        {applicationsState === 'LOADING' && applications.length === 0 ? (
          <p className="muted-text">Loading applications for this AMIS recruitment...</p>
        ) : null}

        {pageApplications.length > 0 ? (
          <ul className="cv-candidate-list">
            {pageApplications.map((application) => (
              <CandidateCard
                key={application.applicationId}
                application={application}
                isSelected={selectedCvApplicationIds.has(application.applicationId)}
                onToggleSelect={onToggleCvCandidateSelection}
                isAmisUploadPending={pendingAmisUploadApplicationIds.has(application.applicationId)}
                isAiEvaluationUploaded={aiEvaluationUploadedApplicationIds.has(application.applicationId)}
                isCurrentAmisCandidate={Boolean(
                  activeAmisCandidateId
                  && application.amisCandidateId === activeAmisCandidateId,
                )}
                isAmisCandidateFormOpen={isAmisCandidateFormOpen}
                aiScreeningApplicationId={aiScreeningApplicationId}
                aiEvaluationApplicationId={aiEvaluationApplicationId}
                cvUploadApplicationId={cvUploadApplicationId}
                amisRecruitmentRounds={amisRecruitmentRounds}
                onUploadApplicationCvToAmisForm={onUploadApplicationCvToAmisForm}
                onRunAiScreeningForApplication={onRunAiScreeningForApplication}
                onUploadAiEvaluationToAmis={onUploadAiEvaluationToAmis}
              />
            ))}
          </ul>
        ) : (
          <div className="empty-panel-state">
            <strong>Không tìm thấy hồ sơ ứng viên</strong>
          </div>
        )}

        {filteredApplications.length > CV_APPLICATION_PAGE_SIZE && (
          <div className="cv-list-pagination">
            <span>Hiển thị {visibleStart} - {visibleEnd} của {filteredApplications.length} kết quả</span>
            <div>
              <button
                type="button"
                className="cv-page-button"
                disabled={currentPage <= 1}
                aria-label="Trang trước"
                onClick={() => setCvApplicationPage((page) => Math.max(1, page - 1))}
              >
                <BackIcon />
              </button>
              {paginationPages.map((page) => (
                <button
                  key={page}
                  type="button"
                  className={`cv-page-button${page === currentPage ? ' is-active' : ''}`}
                  aria-current={page === currentPage ? 'page' : undefined}
                  onClick={() => setCvApplicationPage(page)}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                className="cv-page-button"
                disabled={currentPage >= totalPages}
                aria-label="Trang sau"
                onClick={() => setCvApplicationPage((page) => Math.min(totalPages, page + 1))}
              >
                <ChevronRightIcon />
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }
}

export function getCvOverviewStats(applications: ExtensionApplication[]) {
  const totalApplied = applications.length;
  const newCount = applications.filter((application) =>
    normalizeStatus(application.status).includes('NEW')
    || normalizeStatus(application.status).includes('APPLIED')
    || normalizeStatus(application.status).includes('RECEIVED'),
  ).length;
  const processingCount = applications.filter((application) => {
    const statuses = [
      application.status,
      application.cvScanStatus,
      application.cvSanitizeStatus,
      application.cvParseStatus,
    ].map(normalizeStatus);
    return statuses.some((status) =>
      status.includes('PENDING')
      || status.includes('PROCESS')
      || status.includes('PARSING')
      || status.includes('SCANNING')
      || status.includes('SANITIZING'),
    );
  }).length;
  const readyCount = applications.filter((application) => getCvApplicationFilterBucket(application) === 'PASSED').length;
  const reviewCount = applications.filter((application) => getCvApplicationFilterBucket(application) === 'REVIEW').length;
  const failedCount = applications.filter((application) => getCvApplicationFilterBucket(application) === 'FAILED').length;
  const syncErrorCount = applications.filter((application) => getCvSyncFilterBucket(application) === 'ERROR').length;

  return {
    totalApplied,
    newCount,
    processingCount,
    syncErrorCount,
    readyCount,
    reviewCount,
    failedCount,
    noAnswerCount: applications.filter((application) => getApplicationQuestionStatus(application).code !== 'ANSWERED').length,
  };
}

export function getApplicationCvDisplayStatus(application: ExtensionApplication) {
  const parseStatus = normalizeStatus(application.cvParseStatus);
  const sanitizeStatus = normalizeStatus(application.cvSanitizeStatus);
  const scanStatus = normalizeStatus(application.cvScanStatus);

  if (
    parseStatus === 'PARSED'
    && sanitizeStatus === 'SANITIZED'
    && (scanStatus === 'CLEAN' || scanStatus === 'SCANNED')
  ) {
    return { label: 'Hợp lệ', tone: 'is-success' };
  }

  if (
    parseStatus.includes('FAIL')
    || scanStatus.includes('INFECTED')
    || sanitizeStatus.includes('FAIL')
  ) {
    return { label: 'Lỗi', tone: 'is-danger' };
  }

  if (
    parseStatus.includes('PROCESS')
    || parseStatus.includes('PARSING')
    || scanStatus.includes('SCANNING')
    || sanitizeStatus.includes('SANITIZING')
    || normalizeStatus(application.status).includes('PROCESS')
    || application.attachmentCvName
  ) {
    return { label: 'Đang quét', tone: 'is-warning' };
  }

  return { label: 'Chưa có CV', tone: 'is-danger' };
}

export function getCvApplicationFilterBucket(application: ExtensionApplication): CvStatusFilter {
  const cvStatus = getApplicationCvDisplayStatus(application);
  if (cvStatus.tone === 'is-success') return 'PASSED';
  if (cvStatus.tone === 'is-danger') return 'FAILED';
  return 'REVIEW';
}

export function getCvSyncFilterBucket(application: ExtensionApplication): CvSyncStatusBucket {
  if (application.amisCandidateId) return 'SYNCED';
  return 'NOT_SYNCED';
}

export function matchesCvQuestionFilter(application: ExtensionApplication, filter: CvQuestionFilter) {
  if (filter === 'ALL') return true;
  return getApplicationQuestionStatus(application).code === filter;
}

export function matchesCvSyncFilter(application: ExtensionApplication, filter: CvSyncFilter) {
  if (filter === 'ALL') return true;
  if (filter === 'AMIS_SYNCED') return Boolean(application.amisCandidateId);
  if (filter === 'AMIS_NOT_SYNCED') return !application.amisCandidateId;
  return true;
}

export function matchesCvEvaluationFilter(
  application: ExtensionApplication,
  filter: CvEvaluationFilter,
  uploadedApplicationIds: Set<string>,
) {
  if (filter === 'ALL') return true;
  if (filter === 'EVALUATION_UPLOADED') return uploadedApplicationIds.has(application.applicationId);
  if (filter === 'EVALUATION_NOT_UPLOADED') {
    return normalizeStatus(application.aiScreeningStatus) === 'DONE'
      && !uploadedApplicationIds.has(application.applicationId);
  }
  return normalizeStatus(application.aiScreeningStatus) !== 'DONE'
    && !uploadedApplicationIds.has(application.applicationId);
}

export function getVisibleCvApplications(
  applications: ExtensionApplication[],
  questionFilter: CvQuestionFilter,
  syncFilter: CvSyncFilter,
  evaluationFilter: CvEvaluationFilter,
  sourceFilter: CvSourceFilter,
  sortMode: CvSortMode,
  aiEvaluationUploadedApplicationIds: Set<string>,
) {
  return applications
    .filter((application) => matchesCvQuestionFilter(application, questionFilter))
    .filter((application) => matchesCvSyncFilter(application, syncFilter))
    .filter((application) => matchesCvEvaluationFilter(
      application,
      evaluationFilter,
      aiEvaluationUploadedApplicationIds,
    ))
    .filter((application) => sourceFilter === 'ALL' || getCvSourceFilterBucket(application) === sourceFilter)
    .slice()
    .sort((first, second) => {
      if (sortMode === 'SCORE_ASC' || sortMode === 'SCORE_DESC') {
        const scoreDelta = (getApplicationMatchScore(first) ?? -1)
          - (getApplicationMatchScore(second) ?? -1);
        return sortMode === 'SCORE_ASC' ? scoreDelta : -scoreDelta;
      }

      const firstAppliedTime = getTimeValue(first.applyDate);
      const secondAppliedTime = getTimeValue(second.applyDate);
      const firstTime = firstAppliedTime || getTimeValue(first.createdAt);
      const secondTime = secondAppliedTime || getTimeValue(second.createdAt);
      const appliedTimeDelta = firstTime - secondTime;
      if (appliedTimeDelta !== 0) {
        return sortMode === 'APPLIED_ASC' ? appliedTimeDelta : -appliedTimeDelta;
      }

      const createdTimeDelta = getTimeValue(first.createdAt) - getTimeValue(second.createdAt);
      return sortMode === 'APPLIED_ASC' ? createdTimeDelta : -createdTimeDelta;
    });
}

export function getPaginationPages(currentPage: number, totalPages: number) {
  const pageCount = Math.min(3, totalPages);
  const firstPage = Math.min(Math.max(1, currentPage - 1), Math.max(1, totalPages - pageCount + 1));
  return Array.from({ length: pageCount }, (_, index) => firstPage + index);
}

function getTimeValue(value: string | null | undefined) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function normalizeStatus(value?: string | null) {
  return value?.toUpperCase().trim() ?? '';
}

function slugifyForDisplay(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'job-posting';
}
