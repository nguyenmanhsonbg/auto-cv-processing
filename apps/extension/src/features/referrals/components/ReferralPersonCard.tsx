import type { ReferralManagementPerson, ReferralManagementApplication, ReferralManagementSource } from '@/types/types';
import { StatsMetricGrid } from '@/components/metrics/StatsMetricGrid';
import {
  UnlockIcon,
  ActionLockIcon as LockIcon,
  CopyIcon,
  DetailChevronIcon,
} from '@/components/svg';
import { ApplicationTable } from './ApplicationTable';

export interface ReferralPersonCardProps {
  person: ReferralManagementPerson;
  source: ReferralManagementSource;
  applications: ReferralManagementApplication[];
  isExpanded: boolean;
  copiedIdentifier: string | null;
  isClientFilterMode?: boolean;
  onToggleExpand: (sourceId: string) => void;
  onCopyIdentifier: (identifier: string) => void;
  onRequestStatusChange: (person: ReferralManagementPerson) => void;
}

export function truncateReferralPersonName(value: string) {
  const maxLength = 24;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

export function ReferralPersonCard({
  person,
  source,
  applications,
  isExpanded,
  copiedIdentifier,
  isClientFilterMode = false,
  onToggleExpand,
  onCopyIdentifier,
  onRequestStatusChange,
}: ReferralPersonCardProps) {
  const metrics = isClientFilterMode ? {
    total: applications.length,
    processing: applications.filter((app) => app.statusCategory === 'PROCESSING').length,
    passed: applications.filter((app) => app.statusCategory === 'PASSED').length,
    failed: applications.filter((app) => app.statusCategory === 'REJECTED').length,
    passRate: applications.length > 0 ? Math.round((applications.filter((app) => app.statusCategory === 'PASSED').length / applications.length) * 100) : 0,
  } : person.metrics;

  return (
    <article className={`referral-person-card${person.isActive ? '' : ' is-inactive'}`} key={person.sourceId}>
      <div className="referral-person-heading">
        <div className="referral-person-identity">
          <div className="referral-person-name-row">
            <h3 title={person.name || undefined}>
              {person.name ? truncateReferralPersonName(person.name) : null}
            </h3>
            {!person.isActive ? <span className="referral-active-badge is-inactive">Đã khóa</span> : null}
          </div>
          {person.identifier ? (
            <div className="referral-person-identifier-row">
              <span className="referral-identifier">
                <span>{person.identifier}</span>
                <button
                  type="button"
                  className={`referral-copy-button${copiedIdentifier === person.identifier ? ' is-copied' : ''}`}
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
            {(() => {
              const fullText = [person.email, person.phone].filter(Boolean).join(' • ');
              return (
                <span title={fullText.length > 50 ? fullText : undefined}>
                  {fullText}
                </span>
              );
            })()}
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
        onClick={() => onToggleExpand(person.sourceId)}
        aria-expanded={isExpanded}
      >
        <span>Chi tiết</span>
        <DetailChevronIcon isOpen={isExpanded} />
      </button>

      {isExpanded ? (
        <div className="referral-expanded-overlay">
          <ApplicationTable applications={applications} source={source} />
        </div>
      ) : null}
    </article>
  );
}
