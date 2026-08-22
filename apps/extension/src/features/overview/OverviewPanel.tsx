import type {
  AmisApplicationsForRecruitment,
  AmisJobSnapshot,
  ApiPagination,
  JobDescriptionSummary,
} from '@/types/types';
import {
  DownloadIcon,
  InfoExportIcon,
  MoreVerticalIcon,
} from '@/components/icons';
import type { WorkspaceTab } from '../candidates/CvManagementPanel';

export type OverviewPanelProps = {
  jobDescriptionPagination: ApiPagination | null;
  jobDescriptions: JobDescriptionSummary[];
  snapshot: AmisJobSnapshot | null;
  selectedJobDescription: JobDescriptionSummary | null;
  applicationsContext: AmisApplicationsForRecruitment | null;
  onSelectWorkspaceTab: (tab: WorkspaceTab) => void;
  onLoadMockSnapshot: () => void;
  onLoadLatestAmisCapture: () => void;
  onLoadLatestAutoSyncState: () => void;
};

export function OverviewPanel({
  jobDescriptionPagination,
  jobDescriptions,
  snapshot,
  selectedJobDescription,
  applicationsContext,
  onSelectWorkspaceTab,
  onLoadMockSnapshot,
  onLoadLatestAmisCapture,
  onLoadLatestAutoSyncState,
}: OverviewPanelProps) {
  const totalPostings = Math.max(
    jobDescriptionPagination?.total ?? 0,
    jobDescriptions.length,
    snapshot ? 1 : 0,
  );
  const totalPositions = Math.max(jobDescriptions.length, snapshot ? 1 : 0);
  const totalCvs = applicationsContext?.total ?? 0;
  const postingCards = [
    ...(snapshot ? [{
      key: 'snapshot',
      title: snapshot.title,
      company: snapshot.location ?? selectedJobDescription?.title ?? 'AMIS Recruitment',
      deadline: snapshot.deadline,
      statusLabel: 'Đang hoạt động',
      statusTone: 'active',
      badgeLabel: 'Đang tuyển',
      badgeTone: 'active',
      candidateCount: applicationsContext?.total ?? 0,
      examCount: 0,
      interviewCount: 0,
      offerCount: 0,
      hiredCount: 0,
    }] : []),
    ...jobDescriptions.slice(0, snapshot ? 2 : 3).map((jobDescription) => ({
      key: jobDescription.id,
      title: jobDescription.title,
      company: jobDescription.position?.name ?? jobDescription.level?.displayName ?? 'VCS Recruitment',
      deadline: jobDescription.updatedAt ?? jobDescription.createdAt,
      statusLabel: formatStatusText(jobDescription.status),
      statusTone: jobDescription.status.toUpperCase().includes('ACTIVE') ? 'active' : 'muted',
      badgeLabel: jobDescription.status.toUpperCase().includes('DRAFT') ? 'Nội bộ' : 'Đang tuyển',
      badgeTone: jobDescription.status.toUpperCase().includes('DRAFT') ? 'muted' : 'active',
      candidateCount: null,
      examCount: null,
      interviewCount: null,
      offerCount: null,
      hiredCount: null,
    })),
  ];

  return (
    <div className="overview-panel-content">
      <div className="overview-metric-grid">
        <article>
          <strong>{totalPostings}</strong>
          <span>Tổng bài đăng</span>
        </article>
        <article>
          <strong>{totalPositions}</strong>
          <span>Vị trí tuyển</span>
        </article>
        <article>
          <strong>{totalCvs}</strong>
          <span>Tổng số CV</span>
        </article>
      </div>

      <div className="posting-card-list">
        {postingCards.length > 0 ? postingCards.map((posting) => (
          <article key={posting.key} className="posting-card">
            <div className="posting-card-top">
              <label className="posting-select-box">
                <input type="checkbox" aria-label={`Chọn ${posting.title}`} />
                <span className={`posting-status-dot is-${posting.statusTone}`} />
              </label>
              <h3>{posting.title}</h3>
              <span className={`posting-badge is-${posting.badgeTone}`}>{posting.badgeLabel}</span>
              <button type="button" className="posting-more-button" aria-label="Thêm tùy chọn">
                <MoreVerticalIcon />
              </button>
            </div>
            <p className={`posting-status-text is-${posting.statusTone}`}>{posting.statusLabel}</p>
            <p className="posting-company">{posting.company}</p>
            <p className="posting-deadline">
              SL cần tuyển: 1 | Hạn nộp hồ sơ: {posting.deadline ? formatDate(posting.deadline) : '-'}
            </p>
            <div className="posting-funnel-grid">
              <span><strong>{formatMetricValue(posting.candidateCount)}</strong>Ứng tuyển</span>
              <span><strong>{formatMetricValue(posting.examCount)}</strong>Thi tuyển</span>
              <span><strong>{formatMetricValue(posting.interviewCount)}</strong>Phỏng vấn</span>
              <span><strong>{formatMetricValue(posting.offerCount)}</strong>Offer</span>
              <span><strong>{formatMetricValue(posting.hiredCount)}</strong>Đã tuyển</span>
            </div>
            <button
              type="button"
              className="manage-posting-button"
              onClick={() => onSelectWorkspaceTab('posting')}
            >
              Quản lý
            </button>
          </article>
        )) : (
          <div className="empty-panel-state">
            <strong>Chưa có dữ liệu posting</strong>
            <span>Mở AMIS recruitment hoặc tải mock snapshot để xem dữ liệu.</span>
            <button type="button" className="manage-posting-button" onClick={onLoadMockSnapshot}>
              Load mock snapshot
            </button>
          </div>
        )}
      </div>

      <div className="overview-footer-actions">
        <button type="button" className="secondary-action-button" onClick={() => void onLoadLatestAmisCapture()}>
          <DownloadIcon />
          <span>Tải AMIS save</span>
        </button>
        <button type="button" className="secondary-action-button" onClick={() => void onLoadLatestAutoSyncState()}>
          <InfoExportIcon />
          <span>Tải auto sync</span>
        </button>
      </div>
    </div>
  );
}

function formatStatusText(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDate(value: string | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

function formatMetricValue(value: number | null) {
  return value === null ? '-' : String(value);
}
