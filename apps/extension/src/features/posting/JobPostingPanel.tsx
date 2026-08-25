import React, { useRef, useState } from 'react';
import type {
  AmisAutoSyncState,
  AmisJobSnapshot,
  ApiPagination,
  ChannelPostingResult,
  ExtensionChannel,
  ExtensionSyncResponse,
  FacebookAccount,
  FacebookPublishImageAttachment,
  FacebookPublishProgress,
  FacebookPublishResultPayload,
  FacebookPublishTarget,
  FacebookPublishTargetEligibilityStatus,
  JobDescriptionQuestionSetContext,
  JobDescriptionSummary,
  SyncVcsPortalJdWarning,
  SyncVcsPortalJdsResponse,
} from '@/types/types';
import {
  BackIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CloseIcon,
  ExternalLinkIcon,
  FacebookGenerateIcon,
  GearIcon,
  HistoryIcon,
} from '@/components/icons';
import { SearchField, SelectFilter } from '@/components/filters';
import { TopCvEditModal } from '@/features/topcv/TopCvEditModal';
import { TopCvPreviewModal } from '@/features/topcv/TopCvPreviewModal';
import { TopCvContentPanel } from '@/features/topcv/TopCvContentPanel';
import type { TopCvFormData } from '@/features/topcv/topcv-form.types';
import type { TopCvAuthState } from '@/features/topcv/topcv-auth';
import { isFacebookResultPendingReview } from '@/features/facebook/facebook-channel-status';

export type JobDescriptionState = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';
export type JobDescriptionFillState = 'IDLE' | 'FILLING' | 'SUCCESS' | 'ERROR';
export type FacebookGroupLoadState =
  | 'IDLE'
  | 'CHECKING_LOGIN'
  | 'WAITING_LOGIN'
  | 'LOADING_SAVED_GROUPS'
  | 'LOADING_GROUPS'
  | 'READY'
  | 'ERROR';
export type FacebookContentState = 'IDLE' | 'GENERATING' | 'READY' | 'ERROR';
export type PanelState = 'AUTH_LOADING' | 'AUTH_REQUIRED' | 'READY' | 'EXTRACTING' | 'SYNCING' | 'SUCCESS' | 'ERROR';
import { POSTING_CHANNELS } from '@/lib/config';

export type TopCvModalMode = 'EDIT' | 'PREVIEW' | null;
export type ExtensionToastKind = 'SUCCESS' | 'ERROR' | 'INFO';

export interface FacebookGroupUiItem {
  key: string;
  id: string | null;
  name: string;
  url?: string | null;
  eligibilityStatus: FacebookPublishTargetEligibilityStatus;
  eligibilityReason?: string | null;
  quotaLabel: string | null;
  selectable: boolean;
  disabledReason?: string | null;
}

export { POSTING_CHANNELS };
export const FACEBOOK_IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';
export const JOB_DESCRIPTION_STATUS_OPTIONS = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'ACTIVE', label: 'Công khai' },
  { value: 'DRAFT', label: 'Nội bộ' },
  { value: 'ARCHIVED', label: 'Đóng' },
];

export interface JobDescriptionConfig {
  jobDescriptions: JobDescriptionSummary[];
  selectedJobDescription: JobDescriptionSummary | null;
  fillingJobDescriptionId: string | null;
  jobDescriptionFillState: JobDescriptionFillState;
  lockedAmisJobDescriptionId: string | null;
  jobDescriptionStatus: JobDescriptionState;
  jobDescriptionError: string | null;
  jobDescriptionFillMessage: string | null;
  vcsPortalSyncResult: SyncVcsPortalJdsResponse | null;
  onSyncVcsPortalJobDescriptions: () => Promise<void>;
  jobDescriptionPagination: ApiPagination | null;
  onLoadJobDescriptions: (token: string | null, page: number, options?: { search?: string; status?: string }) => Promise<void>;
  onFillJobDescriptionInAmis: (jobDescription: JobDescriptionSummary) => Promise<void>;
  jobDescriptionQuestionContext: JobDescriptionQuestionSetContext | null;
  onOpenFrontendQuestionEditor: () => void;
}

export interface FacebookPostingConfig {
  selectedPostingChannels: ExtensionChannel[];
  onToggleChannel: (channel: ExtensionChannel) => Promise<void> | void;
  facebookGroupLoadState: FacebookGroupLoadState;
  facebookGroupMessage: string | null;
  facebookGroupDiagnostic: string | null;
  visibleFacebookGroups: FacebookGroupUiItem[];
  visibleSelectedFacebookGroupCount: number;
  selectedFacebookGroupIds: string[];
  onToggleFacebookGroupSelection: (groupId: string | null) => void;
  onOpenFacebookPostHistory: (target: { id: string | null; name: string; url?: string | null }) => void;
  onOpenFacebookGroupSettings: (event: React.MouseEvent<HTMLButtonElement>) => Promise<void> | void;
  onOpenFacebookIneligibleModal?: () => void;
  onSyncFacebookGroups: () => Promise<void> | void;
  facebookImageInputRef: React.RefObject<HTMLInputElement | null>;
  facebookImageAttachments: FacebookPublishImageAttachment[];
  isFacebookImageReading: boolean;
  facebookImageAttachmentError: string | null;
  facebookImageUploadDisabled: boolean;
  onHandleFacebookImageFileChange: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void> | void;
  onClearFacebookImageAttachment: (index?: number) => Promise<void> | void;
  facebookSelected: boolean;
  facebookContentBusy: boolean;
  facebookPreviewIdentity: Pick<FacebookAccount, 'displayName' | 'avatarUrl'> | null;
  snapshot: AmisJobSnapshot | null;
  getEffectiveFacebookContent: () => string;
  onGenerateFacebookPostContent: (options?: {
    snapshotOverride?: AmisJobSnapshot;
    selectedJobDescriptionOverride?: JobDescriptionSummary | null;
    forceFacebookChannel?: boolean;
    mode?: 'TEMPLATE' | 'AI';
  }) => Promise<string | null | void>;
  onOpenFacebookPreviewModal: () => Promise<void> | void;
  facebookPublishResultsVisible: boolean;
  facebookProgress: FacebookPublishProgress | null;
  facebookRunning: boolean;
}

export interface TopCvPostingConfig {
  topCvAuth: TopCvAuthState | null;
  isCheckingTopCvAuth: boolean;
  topCvLoadingFromBe: boolean;
  setTopCvAuth: React.Dispatch<React.SetStateAction<TopCvAuthState | null>>;
  topCvFormData: TopCvFormData;
  setTopCvFormData: React.Dispatch<React.SetStateAction<TopCvFormData>>;
  topCvPublishing: boolean;
  topCvModalMode: TopCvModalMode;
  setTopCvModalMode: React.Dispatch<React.SetStateAction<TopCvModalMode>>;
  onShowExtensionToast: (kind: ExtensionToastKind, title: string, message: string) => void;
  onLogoutTopCv: () => Promise<void>;
  onFetchTopCvFromBackend?: () => Promise<void>;
}

export interface SyncPostingConfig {
  state: PanelState;
  error: string | null;
  result: ExtensionSyncResponse | null;
  syncDisabled: boolean;
  onSync: () => void;
  autoSyncState: AmisAutoSyncState | null;
}

export type JobPostingPanelProps = {
  token: string | null;
  syncConfig: SyncPostingConfig;
  jdConfig: JobDescriptionConfig;
  facebookConfig: FacebookPostingConfig;
  topCvConfig: TopCvPostingConfig;
};

export function JobPostingPanel({
  token,
  syncConfig,
  jdConfig,
  facebookConfig,
  topCvConfig,
}: JobPostingPanelProps) {
  // Local UI states
  const [jobDescriptionSearch, setJobDescriptionSearch] = useState('');
  const [jobDescriptionStatusFilter, setJobDescriptionStatusFilter] = useState('ALL');
  const [isFacebookGroupListExpanded, setIsFacebookGroupListExpanded] = useState(true);
  const [isTopCvExpanded, setIsTopCvExpanded] = useState(true);
  const [isFacebookResultsExpanded, setIsFacebookResultsExpanded] = useState(true);
  const [facebookGroupSearchInput, setFacebookGroupSearchInput] = useState('');
  const [facebookGroupSearchQuery, setFacebookGroupSearchQuery] = useState('');

  // Local refs
  const facebookGroupSearchInputRef = useRef<HTMLInputElement | null>(null);
  const jobDescriptionSearchDebounceRef = useRef<number | null>(null);

  const {
    state,
    error,
    result,
    syncDisabled,
    onSync,
    autoSyncState,
  } = syncConfig;

  const {
    jobDescriptions,
    selectedJobDescription,
    fillingJobDescriptionId,
    jobDescriptionFillState,
    lockedAmisJobDescriptionId,
    jobDescriptionStatus,
    jobDescriptionError,
    jobDescriptionFillMessage,
    vcsPortalSyncResult,
    onSyncVcsPortalJobDescriptions,
    jobDescriptionPagination,
    onLoadJobDescriptions,
    onFillJobDescriptionInAmis,
    jobDescriptionQuestionContext,
    onOpenFrontendQuestionEditor,
  } = jdConfig;

  const {
    selectedPostingChannels,
    onToggleChannel,
    facebookGroupLoadState,
    facebookGroupMessage,
    facebookGroupDiagnostic,
    visibleFacebookGroups,
    visibleSelectedFacebookGroupCount,
    selectedFacebookGroupIds,
    onToggleFacebookGroupSelection,
    onOpenFacebookPostHistory,
    onOpenFacebookGroupSettings,
    onOpenFacebookIneligibleModal,
    onSyncFacebookGroups,
    facebookImageInputRef,
    facebookImageAttachments,
    isFacebookImageReading,
    facebookImageAttachmentError,
    facebookImageUploadDisabled,
    onHandleFacebookImageFileChange,
    onClearFacebookImageAttachment,
    facebookSelected,
    facebookContentBusy,
    facebookPreviewIdentity,
    snapshot,
    getEffectiveFacebookContent,
    onGenerateFacebookPostContent,
    onOpenFacebookPreviewModal,
    facebookPublishResultsVisible,
    facebookProgress,
    facebookRunning,
  } = facebookConfig;

  const {
    topCvAuth,
    isCheckingTopCvAuth,
    topCvLoadingFromBe,
    setTopCvAuth,
    topCvFormData,
    setTopCvFormData,
    topCvPublishing,
    topCvModalMode,
    setTopCvModalMode,
    onShowExtensionToast,
    onLogoutTopCv,
    onFetchTopCvFromBackend,
  } = topCvConfig;

  const filteredFacebookGroups = React.useMemo(() => {
    const query = facebookGroupSearchQuery.trim().toLocaleLowerCase('vi-VN');
    if (!query) return visibleFacebookGroups;

    return visibleFacebookGroups.filter((group) => (
      group.name.toLocaleLowerCase('vi-VN').includes(query)
    ));
  }, [facebookGroupSearchQuery, visibleFacebookGroups]);

  function onSubmitJobDescriptionSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (jobDescriptionSearchDebounceRef.current !== null) {
      window.clearTimeout(jobDescriptionSearchDebounceRef.current);
      jobDescriptionSearchDebounceRef.current = null;
    }
    void onLoadJobDescriptions(token, 1, { search: jobDescriptionSearch.trim() });
  }

  if (topCvModalMode === 'EDIT' && topCvFormData) {
    return (
      <TopCvEditModal
        formData={topCvFormData}
        onChange={setTopCvFormData}
        onSave={(data) => {
          setTopCvFormData(data);
          setTopCvModalMode(null);
        }}
        onPreview={() => setTopCvModalMode('PREVIEW')}
        onClose={() => setTopCvModalMode(null)}
      />
    );
  }

  if (topCvModalMode === 'PREVIEW' && topCvFormData) {
    return (
      <TopCvPreviewModal
        formData={topCvFormData}
        onEdit={() => setTopCvModalMode('EDIT')}
        onClose={() => setTopCvModalMode(null)}
      />
    );
  }

  return (
    <div className="posting-detail-content">
      {renderJobDescriptionPanel()}
      {renderCareerQuestionPanel()}
      {renderChannelPanel()}

      <button
        type="button"
        className="primary-button sync-button"
        disabled={syncDisabled}
        onClick={onSync}
      >
        {facebookRunning
          ? 'ĐANG ĐĂNG FACEBOOK...'
          : topCvPublishing
            ? 'ĐANG ĐĂNG TOPCV...'
            : state === 'SYNCING'
              ? 'ĐANG ĐỒNG BỘ...'
              : isFacebookImageReading
                ? 'ĐANG TẢI ẢNH...'
                : 'ĐỒNG BỘ VÀ ĐĂNG'}
      </button>

      {facebookSelected && facebookPublishResultsVisible ? renderFacebookPublishResultsPanel() : null}

      {state === 'ERROR' && error ? <p className="error-text">{error}</p> : null}

      {!facebookSelected && result ? (
        <section className="result-panel publish-result-panel">
          <div>
            <h2>Kết quả</h2>
          </div>
          <ul className="result-list">
            {result.channelPostings.map((channel) => (
              <li key={channel.channel} className="result-item">
                <span className="result-channel-name">{formatChannelLabel(channel.channel)}</span>
                <span className="result-actions">
                  <strong className={`result-status ${getChannelPostingStatusClass(channel)}`}>
                    {channel.status}
                  </strong>
                  {channel.publishedUrl ? (
                    <a className="result-open-link" href={channel.publishedUrl} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {renderRuntimePanels()}
    </div>
  );

  function renderJobDescriptionPanel() {
    const totalItems = jobDescriptionPagination?.total ?? jobDescriptions.length;
    const currentPage = jobDescriptionPagination?.page ?? 1;
    const pageLimit = jobDescriptionPagination?.limit ?? 5;
    const totalPages = jobDescriptionPagination?.totalPages ?? 1;
    const visibleStart = totalItems === 0 ? 0 : ((currentPage - 1) * pageLimit) + 1;
    const visibleEnd = totalItems === 0 ? 0 : Math.min(totalItems, visibleStart + jobDescriptions.length - 1);
    const paginationPages = buildCompactPaginationPages(currentPage, totalPages);

    return (
      <section className="jd-panel compact-workspace-section post-card-section">
        <h2 className="job-description-panel-title">Mô tả công việc</h2>

        <form className="jd-toolbar" onSubmit={onSubmitJobDescriptionSearch}>
          <SearchField
            className="jd-search-field"
            value={jobDescriptionSearch}
            onChange={(value) => {
              setJobDescriptionSearch(value);
              if (jobDescriptionSearchDebounceRef.current !== null) {
                window.clearTimeout(jobDescriptionSearchDebounceRef.current);
                jobDescriptionSearchDebounceRef.current = null;
              }

              if (!value.trim()) {
                void onLoadJobDescriptions(token, 1, { search: '' });
                return;
              }

              jobDescriptionSearchDebounceRef.current = window.setTimeout(() => {
                jobDescriptionSearchDebounceRef.current = null;
                void onLoadJobDescriptions(token, 1, { search: value.trim() });
              }, 300);
            }}
            placeholder="Tìm kiếm JD"
            ariaLabel="Tìm kiếm JD"
            clearButton={jobDescriptionSearch ? (
              <button
                type="button"
                className="clear-button"
                aria-label="Xóa tìm kiếm"
                onClick={() => {
                  setJobDescriptionSearch('');
                  if (jobDescriptionSearchDebounceRef.current !== null) {
                    window.clearTimeout(jobDescriptionSearchDebounceRef.current);
                    jobDescriptionSearchDebounceRef.current = null;
                  }
                  void onLoadJobDescriptions(token, 1, { search: '' });
                }}
              >
                <CloseIcon />
              </button>
            ) : null}
          />
          <div className="jd-status-controls">
            <button
              type="button"
              className="portal-sync-button"
              onClick={() => void onSyncVcsPortalJobDescriptions()}
              disabled={jobDescriptionStatus === 'LOADING'}
            >
              Đồng bộ VCS Portal
            </button>
            <SelectFilter
              className="jd-status-filter"
              label="Trạng thái JD"
              ariaLabel="Lọc trạng thái JD"
              value={jobDescriptionStatusFilter}
              options={JOB_DESCRIPTION_STATUS_OPTIONS}
              disabled={jobDescriptionStatus === 'LOADING'}
              onChange={(value: string) => {
                setJobDescriptionStatusFilter(value);
                void onLoadJobDescriptions(token, 1, { status: value });
              }}
            />
          </div>
        </form>

        {vcsPortalSyncResult ? (
          <section className="portal-sync-result" aria-label="VCS Portal sync result">
            <div className="portal-sync-result-header">
              <div>
                <p className="eyebrow">VCS Portal</p>
                <h3>{vcsPortalSyncResult.failedCount > 0 ? 'Sync finished with warnings' : 'Sync complete'}</h3>
              </div>
              <span className="status-badge">
                {formatDate(vcsPortalSyncResult.lastSyncedAt) ?? '-'}
              </span>
            </div>
            <div className="portal-sync-metrics">
              <span><strong>{vcsPortalSyncResult.fetchedCount}</strong>Fetched</span>
              <span><strong>{vcsPortalSyncResult.createdCount}</strong>Created</span>
              <span><strong>{vcsPortalSyncResult.updatedCount}</strong>Updated</span>
              <span><strong>{vcsPortalSyncResult.unchangedCount}</strong>Unchanged</span>
              <span><strong>{vcsPortalSyncResult.archivedCount}</strong>Archived</span>
              <span className={vcsPortalSyncResult.failedCount > 0 ? 'is-danger' : undefined}>
                <strong>{vcsPortalSyncResult.failedCount}</strong>Failed
              </span>
              <span><strong>{vcsPortalSyncResult.questionCount}</strong>Questions</span>
              <span><strong>{vcsPortalSyncResult.questionSetCreatedCount}</strong>Question sets</span>
            </div>
            {vcsPortalSyncResult.warnings?.length ? (
              <ul className="portal-sync-warning-list">
                {vcsPortalSyncResult.warnings.slice(0, 3).map((warning: SyncVcsPortalJdWarning, index: number) => (
                  <li key={`${warning.code}-${warning.sourceJobId ?? warning.sourceSlug ?? index}`}>
                    <strong>{warning.sourceSlug ?? warning.sourceJobId ?? warning.code}</strong>
                    <span>{warning.message}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {jobDescriptionStatus === 'LOADING' ? (
          <p className="muted-text">Đang tải danh sách JD...</p>
        ) : null}

        {jobDescriptionError ? <p className="error-text">Có lỗi kết nối mạng, vui lòng kiểm tra lại</p> : null}

        {jobDescriptionFillMessage ? (
          <p className={jobDescriptionFillState === 'ERROR' ? 'error-text' : 'muted-text'}>
            {jobDescriptionFillMessage}
          </p>
        ) : null}

        {jobDescriptionStatus !== 'LOADING' && jobDescriptions.length === 0 ? (
          <p className="question-select-alert">Không tìm thấy JD phù hợp.</p>
        ) : null}

        {jobDescriptions.length > 0 ? (
          <ul className="jd-card-list">
            {jobDescriptions.map((jobDescription) => {
              const isSelected = selectedJobDescription?.id === jobDescription.id;
              const isLockedByAmis = lockedAmisJobDescriptionId !== null
                && lockedAmisJobDescriptionId !== jobDescription.id;
              const badge = getJobDescriptionStatusBadge(jobDescription.status);
              const displayDate = formatJobDescriptionDisplayDate(
                jobDescription.sourceModifiedAt
                ?? jobDescription.lastSyncedAt
                ?? jobDescription.updatedAt
                ?? jobDescription.createdAt,
              );

              return (
                <li key={jobDescription.id} className={isSelected ? 'is-selected' : undefined}>
                  <button
                    type="button"
                    className="jd-card-button"
                    disabled={jobDescriptionFillState === 'FILLING' || isLockedByAmis}
                    onClick={() => void onFillJobDescriptionInAmis(jobDescription)}
                  >
                    <span className={`status-badge jd-status-badge ${badge.className}`}>{badge.label}</span>
                    <h3>{jobDescription.title}</h3>
                    <p>{summarizeText(jobDescription.summary ?? jobDescription.description)}</p>
                    <small>{displayDate ?? '-'}</small>
                    {fillingJobDescriptionId === jobDescription.id ? (
                      <span className="status-badge jd-fill-badge">Đang chọn</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {jobDescriptionPagination && jobDescriptionPagination.totalPages > 1 ? (
          <div className="pagination-row jd-pagination-row">
            <span>
              Hiển thị từ {visibleStart} - {visibleEnd} của {totalItems} kết quả
            </span>
            <div className="jd-pagination-actions">
              <button
                type="button"
                className="jd-page-button"
                aria-label="Trang trước"
                disabled={jobDescriptionStatus === 'LOADING' || jobDescriptionPagination.page <= 1}
                onClick={() => void onLoadJobDescriptions(
                  token,
                  jobDescriptionPagination.page - 1,
                  { status: jobDescriptionStatusFilter },
                )}
              >
                <BackIcon />
              </button>
              {paginationPages.map((page, index) => (
                page === 'ellipsis' ? (
                  <span key={`ellipsis-${index}`} className="jd-pagination-ellipsis" aria-hidden="true">…</span>
                ) : (
                  <button
                    key={page}
                    type="button"
                    className={`jd-page-button${page === currentPage ? ' is-active' : ''}`}
                    aria-current={page === currentPage ? 'page' : undefined}
                    disabled={jobDescriptionStatus === 'LOADING'}
                    onClick={() => void onLoadJobDescriptions(
                      token,
                      page,
                      { status: jobDescriptionStatusFilter },
                    )}
                  >
                    {page}
                  </button>
                )
              ))}
              <button
                type="button"
                className="jd-page-button"
                aria-label="Trang sau"
                disabled={
                  jobDescriptionStatus === 'LOADING'
                  || jobDescriptionPagination.page >= jobDescriptionPagination.totalPages
                }
                onClick={() => void onLoadJobDescriptions(
                  token,
                  jobDescriptionPagination.page + 1,
                  { status: jobDescriptionStatusFilter },
                )}
              >
                <ChevronRightIcon />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  function renderCareerQuestionPanel() {
    return (
      <section className="question-panel career-question-panel compact-workspace-section post-card-section">
        <div className="question-section-header">
          <h2>Bộ câu hỏi</h2>
          {selectedJobDescription ? (
            <button
              type="button"
              className="question-edit-button"
              onClick={onOpenFrontendQuestionEditor}
              disabled={!jobDescriptionQuestionContext?.questions.length}
            >
              Chỉnh sửa bộ câu hỏi
            </button>
          ) : null}
        </div>

        <div className="career-question-content">
          {!selectedJobDescription ? (
            <p className="question-select-alert">Chọn 1 JD để xem bộ câu hỏi tương ứng</p>
          ) : null}

          {jobDescriptionQuestionContext ? (
            <>
              {jobDescriptionQuestionContext.questions.length > 0 ? (
                <ul className="career-question-list">
                  {jobDescriptionQuestionContext.questions.map((question, index) => (
                    <li key={question.id}>
                      <article className="career-question-card post-question-card">
                        <span className="career-question-card-body">
                          <span className="career-question-title">
                            <strong>{index + 1}.</strong>
                            {question.text}
                          </span>
                        </span>
                      </article>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="career-question-empty">Chưa có dữ liệu bộ câu hỏi</p>
              )}
            </>
          ) : null}
        </div>
      </section>
    );
  }

  function renderChannelPanel() {
    return (
      <section className="channel-section">
        <div className="section-heading-row">
          <p className="section-title">Kênh tuyển dụng</p>
        </div>
        <div className="channel-list">
          {POSTING_CHANNELS.map((channel) => {
            const isSelected = selectedPostingChannels.includes(channel);
            const isFacebookChannel = channel === 'FACEBOOK';
            const isTopCvChannel = channel === 'TOPCV';
            const isFacebookLoading = isFacebookChannel && (facebookGroupLoadState === 'LOADING_SAVED_GROUPS' || facebookGroupLoadState === 'LOADING_GROUPS');
            const showFacebookGroups = isFacebookChannel
              && (isSelected || facebookGroupLoadState !== 'IDLE' || Boolean(facebookGroupMessage));
            const showTopCvContent = isTopCvChannel && isSelected;

            return (
              <div
                key={channel}
                className={`channel-option${isFacebookChannel ? ' is-facebook' : ''}${isTopCvChannel ? ' is-topcv' : ''}${isSelected ? ' is-selected' : ''}`}
              >
                <div className="channel-option-row">
                  <label className="channel-option-label">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isFacebookLoading}
                      onChange={() => void onToggleChannel(channel)}
                    />
                    <span>{formatChannelLabel(channel)}</span>
                  </label>
                  <span className="channel-actions">
                    {showFacebookGroups ? (
                      <button
                        type="button"
                        className="channel-action-button channel-groups-toggle"
                        title={isFacebookGroupListExpanded ? 'Ẩn danh sách nhóm Facebook' : 'Hiện danh sách nhóm Facebook'}
                        aria-label={isFacebookGroupListExpanded ? 'Ẩn danh sách nhóm Facebook' : 'Hiện danh sách nhóm Facebook'}
                        aria-expanded={isFacebookGroupListExpanded}
                        onClick={() => setIsFacebookGroupListExpanded((expanded) => !expanded)}
                      >
                        {isFacebookGroupListExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                      </button>
                    ) : null}
                    {showTopCvContent ? (
                      <button
                        type="button"
                        className="channel-action-button channel-groups-toggle"
                        title={isTopCvExpanded ? 'Ẩn thông tin bài đăng TopCV' : 'Hiện thông tin bài đăng TopCV'}
                        aria-label={isTopCvExpanded ? 'Ẩn thông tin bài đăng TopCV' : 'Hiện thông tin bài đăng TopCV'}
                        aria-expanded={isTopCvExpanded}
                        onClick={() => setIsTopCvExpanded((expanded) => !expanded)}
                      >
                        {isTopCvExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                      </button>
                    ) : null}
                    {isFacebookChannel ? (
                      <button
                        type="button"
                        className="channel-action-button"
                        title="Cài đặt Group Facebook"
                        aria-label="Cài đặt Group Facebook"
                        onClick={(event) => void onOpenFacebookGroupSettings(event)}
                      >
                        <GearIcon />
                      </button>
                    ) : isTopCvChannel ? (
                      <button
                        type="button"
                        className="channel-action-button"
                        title="Cài đặt thông tin TopCV"
                        aria-label="Cài đặt thông tin TopCV"
                      >
                        <GearIcon />
                      </button>
                    ) : (
                      <span className="channel-action-icon" title="Settings">
                        <GearIcon />
                      </span>
                    )}
                  </span>
                </div>
                {showFacebookGroups ? (
                  <div
                    className={`channel-subselection-outer${isFacebookGroupListExpanded ? ' is-expanded' : ' is-collapsed'}`}
                    aria-hidden={!isFacebookGroupListExpanded}
                  >
                    {/* Inner card: NHÓM FACEBOOK */}
                    <div className="channel-inner-card">
                      <div className="channel-inner-card-header">
                        <span>Nhóm Facebook</span>
                        <button
                          type="button"
                          className="channel-subselection-reload-button"
                          title="Tải lại danh sách nhóm Facebook"
                          aria-label="Tải lại danh sách nhóm Facebook"
                          aria-busy={isFacebookLoading}
                          disabled={!token || isFacebookLoading}
                          onClick={() => void onSyncFacebookGroups()}
                        >
                          {isFacebookLoading ? 'Đang tải lại...' : 'Tải lại'}
                        </button>
                      </div>
                      {facebookGroupLoadState === 'READY' && visibleFacebookGroups.length > 0 ? (
                        <div className="channel-inner-card-summary">
                          <span>
                            {visibleSelectedFacebookGroupCount}/{visibleFacebookGroups.length} nhóm Facebook đã được chọn
                          </span>
                          {onOpenFacebookIneligibleModal ? (
                            <button
                              type="button"
                              className="facebook-ineligible-trigger"
                              onClick={() => onOpenFacebookIneligibleModal()}
                            >
                              Xem nhóm không phù hợp
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                      {visibleFacebookGroups.length > 0 ? (
                        <div className="channel-inner-card-search">
                          <SearchField
                            className="channel-subselection-search"
                            inputRef={facebookGroupSearchInputRef as any}
                            value={facebookGroupSearchInput}
                            maxLength={255}
                            placeholder="Tìm kiếm nhóm Facebook"
                            ariaLabel="Tìm kiếm nhóm Facebook"
                            onChange={setFacebookGroupSearchInput}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter') return;
                              event.preventDefault();
                              const trimmedSearch = facebookGroupSearchInput.trim();
                              setFacebookGroupSearchInput(trimmedSearch);
                              setFacebookGroupSearchQuery(trimmedSearch);
                            }}
                            clearButton={facebookGroupSearchInput.length > 0 ? (
                              <button
                                type="button"
                                className="channel-subselection-search-clear"
                                aria-label="Xóa tìm kiếm nhóm Facebook"
                                title="Xóa tìm kiếm nhóm Facebook"
                                onClick={() => {
                                  setFacebookGroupSearchInput('');
                                  setFacebookGroupSearchQuery('');
                                  facebookGroupSearchInputRef.current?.focus();
                                }}
                              >
                                <CloseIcon />
                              </button>
                            ) : null}
                          />
                        </div>
                      ) : null}
                      <div className="channel-inner-card-list">
                        {facebookGroupMessage
                          && !facebookGroupSearchQuery
                          && facebookGroupLoadState !== 'READY' ? (
                          <p className={`channel-subselection-empty${facebookGroupLoadState === 'ERROR' ? ' is-error' : ''}`}>
                            {facebookGroupMessage}
                          </p>
                        ) : null}
                        {facebookGroupDiagnostic ? (
                          <details className="channel-subselection-debug">
                            <summary>Chi tiết lỗi GraphQL để báo</summary>
                            <code>{facebookGroupDiagnostic}</code>
                          </details>
                        ) : null}
                        {filteredFacebookGroups.length > 0 ? (
                          filteredFacebookGroups.map((group, index) => (
                            <div
                              key={`${group.key}-${index}`}
                              className={`channel-group-item${!group.selectable ? ' is-disabled' : ''}`}
                              title={!group.selectable ? group.disabledReason ?? undefined : undefined}
                            >
                              <label className="channel-group-select">
                                <input
                                  type="checkbox"
                                  checked={Boolean(group.id && selectedFacebookGroupIds.includes(group.id))}
                                  disabled={!group.id || !group.selectable}
                                  onChange={() => onToggleFacebookGroupSelection(group.id)}
                                />
                                <span className="channel-group-copy">
                                  <span className="channel-group-name">{group.name}</span>
                                  <span className="channel-group-meta">
                                    {getFacebookEligibilityLabel(group.eligibilityStatus)}
                                    {` - Hôm nay đã đăng ${group.quotaLabel ?? '0/10'} bài`}
                                  </span>
                                </span>
                              </label>
                              <button
                                type="button"
                                className="channel-group-info-button"
                                title="Lịch sử đăng bài"
                                aria-label={`Lịch sử đăng bài ${group.name}`}
                                onClick={() => onOpenFacebookPostHistory({
                                  id: group.id,
                                  name: group.name,
                                  url: group.url,
                                })}
                              >
                                <HistoryIcon />
                              </button>
                            </div>
                          ))
                        ) : facebookGroupSearchQuery ? (
                          <p className="channel-subselection-empty">Không tìm thấy nhóm Facebook phù hợp.</p>
                        ) : (
                          facebookGroupLoadState === 'READY'
                            ? <p className="channel-subselection-empty">Đã quét được 0 nhóm</p>
                            : null
                        )}
                      </div>
                    </div>
                    {/* Image upload (hidden input + preview strip) */}
                    {isSelected ? (
                      <>
                        <input
                          ref={facebookImageInputRef as any}
                          type="file"
                          accept={FACEBOOK_IMAGE_ACCEPT}
                          multiple
                          className="facebook-image-input"
                          onChange={(event) => void onHandleFacebookImageFileChange(event)}
                        />
                        {facebookImageAttachments.length > 0 || isFacebookImageReading || facebookImageAttachmentError ? (
                          <div className="facebook-image-upload">
                            {facebookImageAttachments.map((attachment, index) => (
                              <div className="facebook-image-preview" key={`${attachment.fileName}-${attachment.size}-${index}`}>
                                <img src={attachment.dataUrl} alt={`Ảnh bài đăng ${index + 1}`} />
                                <div>
                                  <strong>{attachment.fileName}</strong>
                                  <span>{formatFileSize(attachment.size)}</span>
                                </div>
                                <button
                                  type="button"
                                  className="channel-action-button"
                                  title="Xóa ảnh"
                                  aria-label={`Xóa ảnh ${index + 1}`}
                                  disabled={facebookImageUploadDisabled}
                                  onClick={() => void onClearFacebookImageAttachment(index)}
                                >
                                  <CloseIcon />
                                </button>
                              </div>
                            ))}
                            {isFacebookImageReading ? (
                              <p className="channel-subselection-empty">Đang xử lý ảnh...</p>
                            ) : null}
                            {facebookImageAttachmentError ? (
                              <div className="facebook-image-error-row">
                                <p className="channel-subselection-empty is-error">{facebookImageAttachmentError}</p>
                                <button
                                  type="button"
                                  className="text-button"
                                  onClick={() => void onClearFacebookImageAttachment()}
                                >
                                  Bỏ ảnh
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    {/* Inner card: XEM TRƯỚC BÀI ĐĂNG */}
                    {isSelected ? renderFacebookContentPanel() : null}
                  </div>
                ) : null}
                {isSelected && channel === 'TOPCV' && isTopCvExpanded ? (
                  <TopCvContentPanel
                    formData={topCvFormData}
                    topCvAuth={topCvAuth}
                    isCheckingAuth={isCheckingTopCvAuth}
                    isLoadingFromBe={topCvLoadingFromBe}
                    onOpenEdit={() => setTopCvModalMode('EDIT')}
                    onOpenPreview={() => setTopCvModalMode('PREVIEW')}
                    onSyncAuth={(auth) => {
                      setTopCvAuth(auth);
                      if (auth.ok) {
                        onShowExtensionToast('SUCCESS', 'Kênh TopCV', 'Đã đồng bộ tài khoản TopCV từ tab đang mở.');
                      }
                    }}
                    onLogout={async () => {
                      await onLogoutTopCv();
                      setTopCvAuth({ ok: false, reason: 'TOKEN_MISSING' });
                      onShowExtensionToast('INFO', 'Kênh TopCV', 'Đã đăng xuất tài khoản TopCV.');
                    }}
                    onFetchFromBackend={token && selectedJobDescription?.id && onFetchTopCvFromBackend ? () => void onFetchTopCvFromBackend() : undefined}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  function renderFacebookContentPanel() {
    if (!facebookSelected) return null;
    if (!selectedJobDescription) return null;

    const effectiveContent = getEffectiveFacebookContent();
    const canGenerate = Boolean(token && snapshot) && !facebookContentBusy;
    const previewTitle = snapshot?.title ?? selectedJobDescription?.title ?? 'Bài đăng tuyển dụng';
    const previewCopy = effectiveContent
      ? summarizeText(effectiveContent)
      : summarizeText(snapshot?.summary ?? snapshot?.description ?? selectedJobDescription?.summary ?? selectedJobDescription?.description);

    return (
      <div className="channel-inner-card">
        <div className="channel-inner-card-header">
          <span>Xem trước bài đăng</span>
        </div>
        <div className="channel-inner-card-preview">
          {/* Thumbnail + Copy row */}
          <div className="facebook-preview-row">
            {facebookImageAttachments.length > 0 ? (
              <div className="facebook-preview-image-grid">
                {facebookImageAttachments.map((attachment, index) => (
                  <img key={`${attachment.fileName}-${attachment.size}-${index}`} src={attachment.dataUrl} alt={`Ảnh bài đăng ${index + 1}`} />
                ))}
              </div>
            ) : (
              <span className="facebook-preview-thumb" aria-hidden="true">VCS</span>
            )}
            <div className="facebook-preview-copy">
              <strong title={previewTitle}>{previewTitle}</strong>
              <span>{previewCopy || 'Chưa có nội dung preview.'}</span>
            </div>
          </div>
          {/* Character count */}
          <p className="facebook-preview-charcount">{effectiveContent.length} ký tự</p>
          {/* Action buttons: 2-column grid */}
          <div className="facebook-preview-actions">
            <button
              type="button"
              className="facebook-generate-button"
              disabled={!canGenerate}
              onClick={() => void onGenerateFacebookPostContent({ mode: 'AI' })}
            >
              <FacebookGenerateIcon />
              {facebookContentBusy ? 'Đang sinh...' : 'Sinh bài'}
            </button>
            <button
              type="button"
              className="facebook-full-button"
              disabled={facebookContentBusy || !facebookPreviewIdentity}
              onClick={() => void onOpenFacebookPreviewModal()}
            >
              Xem bản đầy đủ
              <ExternalLinkIcon />
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderFacebookPublishResultsPanel() {
    const progressResults = facebookProgress?.results ?? [];
    const resultTargets = result?.facebookPublishPlan?.targets.map(toFacebookGroupUiItem) ?? [];
    const selectedTargets = visibleFacebookGroups.filter((group) => (
      Boolean(group.id) && selectedFacebookGroupIds.includes(group.id as string)
    ));
    const displayTargets = selectedTargets.length > 0
      ? selectedTargets
      : resultTargets.length > 0
        ? resultTargets
        : progressResults.map((item: FacebookPublishResultPayload) => ({
          key: item.targetId ?? item.targetUrl ?? item.targetName,
          id: item.targetId ?? null,
          name: item.targetName,
          url: item.targetUrl,
          eligibilityStatus: 'UNKNOWN' as const,
          eligibilityReason: null,
          quotaLabel: null,
          selectable: false,
          disabledReason: null,
        }));
    const progressByTarget = new Map(
      progressResults.map((item: FacebookPublishResultPayload) => [item.targetId ?? item.targetName, item]),
    );
    const acceptedSubmissionCount = progressResults.filter((item) => (
      item.status === 'SUCCESS' || isFacebookResultPendingReview(item)
    )).length;
    const actualFailureCount = progressResults.filter((item) => (
      !isFacebookResultPendingReview(item)
      && (item.status === 'FAILED' || item.status === 'SKIPPED')
    )).length;
    const isAcceptedSubmissionOnly = acceptedSubmissionCount > 0 && actualFailureCount === 0;
    const channelStatusLabel = isAcceptedSubmissionOnly
      ? 'Đã đăng'
      : facebookProgress
        ? facebookProgress.status === 'SUCCESS'
          ? 'Đã đăng'
          : facebookProgress.status === 'PARTIAL_SUCCESS' || facebookProgress.status === 'ERROR'
            ? 'Đăng lỗi'
            : 'Đang đăng'
        : 'Đang đăng';
    const channelStatusClass = isAcceptedSubmissionOnly
      ? 'is-posted'
      : facebookProgress?.status === 'SUCCESS'
        ? 'is-posted'
        : facebookProgress?.status === 'PARTIAL_SUCCESS' || facebookProgress?.status === 'ERROR'
          ? 'is-failed'
          : 'is-processing';

    return (
      <section className="facebook-publish-results-panel" aria-label="Kết quả đăng Facebook">
        <div className="facebook-publish-results-heading">
          <h2>Kết quả</h2>
        </div>
        <div className="facebook-publish-results-channel">
          <span className="facebook-publish-results-channel-name">FACEBOOK</span>
          <span className="facebook-publish-results-channel-actions">
            <span className={`facebook-publish-results-state ${channelStatusClass}`}>{channelStatusLabel}</span>
            <button
              type="button"
              className="facebook-publish-results-toggle"
              aria-expanded={isFacebookResultsExpanded}
              aria-label={isFacebookResultsExpanded ? 'Thu gọn kết quả Facebook' : 'Mở rộng kết quả Facebook'}
              title={isFacebookResultsExpanded ? 'Thu gọn kết quả' : 'Mở rộng kết quả'}
              onClick={() => setIsFacebookResultsExpanded((current) => !current)}
            >
              {isFacebookResultsExpanded ? <ChevronDownIcon /> : <ChevronUpIcon />}
            </button>
          </span>
        </div>
        {isFacebookResultsExpanded ? (
          <>
            <div className="facebook-publish-results-list">
              {displayTargets.length > 0 ? displayTargets.map((group: FacebookGroupUiItem) => {
                const progress = progressByTarget.get(group.id ?? group.name);
                const isPendingReview = progress ? isFacebookResultPendingReview(progress) : false;
                const isAcceptedSubmission = Boolean(progress)
                  && (progress?.status === 'SUCCESS' || isPendingReview);
                const statusClass = isAcceptedSubmission
                  ? 'is-posted'
                  : progress?.status === 'FAILED'
                      || progress?.status === 'SKIPPED'
                      || facebookProgress?.status === 'PARTIAL_SUCCESS'
                      || facebookProgress?.status === 'ERROR'
                    ? 'is-failed'
                    : 'is-posting';
                const statusLabel = isAcceptedSubmission
                  ? 'Đã đăng'
                  : progress?.status === 'FAILED'
                      || progress?.status === 'SKIPPED'
                      || facebookProgress?.status === 'PARTIAL_SUCCESS'
                      || facebookProgress?.status === 'ERROR'
                    ? 'Đăng lỗi'
                    : 'Đang đăng';

                return (
                  <div className="facebook-publish-result-row" key={group.key}>
                    <span className="facebook-publish-result-name" title={group.name}>{group.name}</span>
                    <span className={`facebook-publish-result-state ${statusClass}`}>{statusLabel}</span>
                  </div>
                );
              }) : (
                <p className="facebook-publish-results-empty">Chưa có nhóm Facebook được chọn.</p>
              )}
            </div>
          </>
        ) : null}
      </section>
    );
  }

  function renderRuntimePanels() {
    return (
      <>
        {autoSyncState ? (
          <section className="capture-panel">
            <div className="status-row">
              <span>Auto sync</span>
              <strong>{autoSyncState.status}</strong>
            </div>
            <dl>
              <div>
                <dt>Updated</dt>
                <dd>{autoSyncState.updatedAt}</dd>
              </div>
              {autoSyncState.channels ? (
                <div>
                  <dt>Channels</dt>
                  <dd>{autoSyncState.channels.join(', ')}</dd>
                </div>
              ) : null}
            </dl>
            {autoSyncState.error ? (
              <p className="error-text">{autoSyncState.error.code}: {autoSyncState.error.message}</p>
            ) : null}
          </section>
        ) : null}
      </>
    );
  }
}

export function buildCompactPaginationPages(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) {
    pages.push('ellipsis');
  }

  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }

  if (end < totalPages - 1) {
    pages.push('ellipsis');
  }

  pages.push(totalPages);
  return pages;
}

export function formatChannelLabel(channel: ExtensionChannel) {
  return channel;
}

export function getChannelPostingStatusClass(channel: ChannelPostingResult) {
  if (channel.status === 'PUBLISHED') return 'is-published';
  if (channel.status === 'FAILED') return 'is-failed';
  if (channel.status === 'SKIPPED') return 'is-skipped';
  return 'is-pending';
}

export function toFacebookGroupUiItem(target: FacebookPublishTarget): FacebookGroupUiItem {
  return {
    key: target.targetId ?? target.targetExternalId ?? target.targetUrl ?? target.targetName,
    id: target.targetId ?? null,
    name: target.targetName,
    url: target.targetUrl ?? null,
    eligibilityStatus: target.eligibilityStatus ?? 'UNKNOWN',
    eligibilityReason: target.eligibilityReason ?? null,
    quotaLabel: target.quotaLabel ?? `${target.todayPublishCount ?? 0}/${target.dailyPublishLimit ?? 10}`,
    selectable: target.eligibilityStatus === 'CAN_POST',
    disabledReason: target.eligibilityReason ?? null,
  };
}

export function getFacebookEligibilityLabel(status?: FacebookPublishTargetEligibilityStatus | null) {
  return status === 'CAN_POST' ? 'Có thể đăng' : 'Không thể đăng';
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function summarizeText(text?: string | null, maxLength = 120) {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 3)}...`;
}

export function getJobDescriptionStatusBadge(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === 'ACTIVE') return { label: 'Công khai', className: 'is-active' };
  if (normalized === 'DRAFT') return { label: 'Nội bộ', className: 'is-draft' };
  if (normalized === 'ARCHIVED') return { label: 'Đóng', className: 'is-archived' };
  return { label: 'Ngừng tuyển', className: 'is-archived' };
}

export function formatJobDescriptionDisplayDate(dateValue?: string | null) {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;

  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDate(value: string | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}
