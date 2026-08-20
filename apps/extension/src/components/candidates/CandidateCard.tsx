import type React from 'react';
import type { AmisApplicationsForRecruitment, AmisRecruitmentRound } from '@/types/types';
import { CandidateAvatar } from './CandidateAvatar';
import { SourceIcon } from '@/components/icons';

export type ExtensionApplication = AmisApplicationsForRecruitment['applications'][number];

export type ApplicationQuestionStatusCode = 'ANSWERED' | 'NOT_ANSWERED';
export type ApplicationQuestionStatus = {
  code: ApplicationQuestionStatusCode;
  label: string;
  tone: 'is-success' | 'is-warning' | 'is-danger' | 'is-muted';
};

export type CandidateCardProps = {
  application: ExtensionApplication;
  isSelected: boolean;
  onToggleSelect: (applicationId: string) => void;
  isAmisUploadPending: boolean;
  isAiEvaluationUploaded: boolean;
  isCurrentAmisCandidate: boolean;
  isAmisCandidateFormOpen: boolean;
  aiScreeningApplicationId: string | null;
  aiEvaluationApplicationId: string | null;
  cvUploadApplicationId: string | null;
  amisRecruitmentRounds: AmisRecruitmentRound[];
  onUploadApplicationCvToAmisForm: (application: ExtensionApplication) => void;
  onRunAiScreeningForApplication: (application: ExtensionApplication) => void;
  onUploadAiEvaluationToAmis: (application: ExtensionApplication) => void;
};

export function CandidateCard({
  application,
  isSelected,
  onToggleSelect,
  isAmisUploadPending,
  isAiEvaluationUploaded,
  isCurrentAmisCandidate,
  isAmisCandidateFormOpen,
  aiScreeningApplicationId,
  aiEvaluationApplicationId,
  cvUploadApplicationId,
  amisRecruitmentRounds,
  onUploadApplicationCvToAmisForm,
  onRunAiScreeningForApplication,
  onUploadAiEvaluationToAmis,
}: CandidateCardProps) {
  const syncStatus = getApplicationAmisSyncStatus(application);
  const questionStatus = getApplicationQuestionStatus(application);
  const isAmisCvUploaded = Boolean(application.attachmentCvId || application.attachmentCvName);
  const aiScreeningDone = normalizeStatus(application.aiScreeningStatus) === 'DONE';
  const aiScreeningRunning = normalizeStatus(application.aiScreeningStatus) === 'REQUESTED'
    || aiScreeningApplicationId === application.applicationId;
  const canRunAiScreening = questionStatus.code === 'ANSWERED';
  const score = aiScreeningDone ? getApplicationMatchScore(application) : null;
  const isAmisSynced = Boolean(application.amisCandidateId);
  const canShowAmisSyncButton = !isAmisSynced && !isAmisCvUploaded;
  const canShowAiScreeningButton = questionStatus.code === 'ANSWERED'
    && isAmisSynced
    && !aiScreeningDone
    && !isAiEvaluationUploaded;
  const canShowAiUploadButton = isAmisSynced
    && isAmisCvUploaded
    && aiScreeningDone
    && isCurrentAmisCandidate
    && !isAiEvaluationUploaded;
  const canSyncToAmis = canShowAmisSyncButton && canUploadApplicationCv(application);
  const aiEvaluationStatus = getApplicationAiEvaluationStatus(application, isAiEvaluationUploaded);
  const candidateStages = getAmisCandidateStageOptions(amisRecruitmentRounds, application);
  const currentStageIndex = getAmisCandidateStageIndex(
    candidateStages,
    application.amisRecruitmentRoundId,
    application.amisRecruitmentRoundName,
  );
  const currentStageLabel = candidateStages[currentStageIndex]?.name
    ?? application.amisRecruitmentRoundName
    ?? 'Chưa cập nhật';
  const isAmisRejected = application.amisStatus === 0;
  const rejectionReason = application.amisReasonRemoved?.trim() || null;
  const recruiterName = application.attractivePersonnelName ?? '-';
  const appliedDate = formatDateTime(application.applyDate ?? application.createdAt ?? undefined) ?? '-';
  const sourceFilterBucket = getCvSourceFilterBucket(application);
  const sourceToneClass = sourceFilterBucket === 'FACEBOOK'
    ? 'is-facebook'
    : sourceFilterBucket === 'VCS_PORTAL'
      ? 'is-vcs-portal'
      : sourceFilterBucket === 'FREELANCER'
        ? 'is-freelancer'
        : sourceFilterBucket === 'INTERNAL'
          ? 'is-internal'
          : '';

  return (
    <li className={isSelected ? 'is-selected' : ''}>
      <div className="cv-candidate-card">
        <div className="cv-candidate-main">
          <label className="cv-candidate-select" aria-label={`Chọn ${application.candidateName}`}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(application.applicationId)}
            />
          </label>
          <CandidateAvatar name={application.candidateName} />
          <div>
            <strong title={application.candidateName}>
              {truncateCandidateName(application.candidateName)}
            </strong>
            <span>{[application.email, application.mobile].filter(Boolean).join(' • ') || 'No contact'}</span>
            <span className="cv-candidate-applied-date">Ngày ứng tuyển: {appliedDate}</span>
          </div>
          {score != null ? (
            <b className={`cv-candidate-score ${getCvScoreTone(score)}`}>{score}</b>
          ) : null}
        </div>
        <div
          className="cv-candidate-process"
          style={{ '--cv-stage-count': String(candidateStages.length) } as React.CSSProperties}
          aria-label={`Vòng hiện tại: ${currentStageLabel}`}
        >
          {candidateStages.map((stage, stageIndex) => (
            <div
              key={stage.id}
              className={`cv-candidate-process-step${stageIndex < currentStageIndex ? ' is-complete' : ''}${stageIndex === currentStageIndex && !isAmisRejected ? ' is-current' : ''}${stageIndex === currentStageIndex && isAmisRejected ? ' is-failed' : ''}`}
            >
              <span className="cv-candidate-process-marker" aria-hidden="true" />
              <span>{stage.name}</span>
            </div>
          ))}
        </div>
        {isAmisRejected && rejectionReason ? (
          <div className="cv-candidate-rejection-reason">
            <strong>Lý do bị loại:</strong>
            <span>{rejectionReason}</span>
          </div>
        ) : null}
        <div className="cv-candidate-info">
          <div className="cv-candidate-meta">
            <span className="cv-candidate-source">
              <SourceIcon />
              <span>Nguồn</span>
              <span className={`cv-source-chip ${sourceToneClass}`.trim()}>{getCvSourceLabel(application)}</span>
            </span>
            <span className="cv-candidate-recruiter">
              Nhân sự khai thác: <strong>{recruiterName}</strong>
            </span>
          </div>
          <div className="cv-candidate-details">
            <div className={`cv-candidate-detail cv-candidate-detail-status cv-question-status ${questionStatus.tone}`}>
              <small>CÂU HỎI</small>
              <strong>{questionStatus.label}</strong>
            </div>
            <div className={`cv-candidate-detail cv-candidate-detail-status ${syncStatus.tone}`}>
              <small>ĐỒNG BỘ AMIS</small>
              <strong>{syncStatus.label}</strong>
            </div>
            <div className={`cv-candidate-detail cv-candidate-detail-status cv-ai-status ${aiEvaluationStatus.tone}`}>
              <small>FILE ĐÁNH GIÁ BẰNG AI</small>
              <strong>{aiEvaluationStatus.label}</strong>
            </div>
          </div>
          <div className="cv-candidate-note">
            <span className="cv-candidate-note-label">Ghi chú của CV</span>
            <span>{application.cvNote?.trim() || 'CV này không có ghi chú nào.'}</span>
          </div>
        </div>
        <div className="cv-candidate-footer">
          {canShowAmisSyncButton && isAmisCandidateFormOpen ? (
            <button
              type="button"
              className="cv-sync-amis-button"
              disabled={!canSyncToAmis || Boolean(cvUploadApplicationId)}
              onClick={() => void onUploadApplicationCvToAmisForm(application)}
            >
              {cvUploadApplicationId === application.applicationId
                ? 'Đang đồng bộ...'
                : isAmisUploadPending
                  ? 'Chờ AMIS lưu'
                  : 'Đồng bộ'}
            </button>
          ) : null}
          {canShowAiScreeningButton ? (
            <button
              type="button"
              className="cv-sync-amis-button"
              disabled={!canRunAiScreening || aiScreeningRunning || Boolean(aiScreeningApplicationId)}
              onClick={() => void onRunAiScreeningForApplication(application)}
            >
              {aiScreeningRunning ? 'Đang đánh giá...' : 'Đánh giá bằng AI'}
            </button>
          ) : null}
          {canShowAiUploadButton ? (
            <button
              type="button"
              className="cv-sync-amis-button"
              disabled={Boolean(aiEvaluationApplicationId)}
              onClick={() => void onUploadAiEvaluationToAmis(application)}
            >
              {aiEvaluationApplicationId === application.applicationId
                ? 'Đang tải lên...'
                : 'Tải file đánh giá lên AMIS'}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function truncateCandidateName(value: string) {
  const maxLength = 24;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

export function getCvScoreTone(score: number) {
  if (score >= 80) return 'is-success';
  if (score >= 50) return 'is-warning';
  return 'is-danger';
}

export function formatDateTime(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const dateLabel = date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeLabel = date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return `${dateLabel} ${timeLabel}`;
}

export function getApplicationAmisSyncStatus(application: ExtensionApplication) {
  if (application.amisCandidateId) return { label: 'Đã đồng bộ', tone: 'is-success' };
  return { label: 'Chưa đồng bộ', tone: 'is-warning' };
}

export function getApplicationAiEvaluationStatus(
  application: ExtensionApplication,
  isEvaluationUploaded: boolean,
) {
  if (isEvaluationUploaded) return { label: 'Đã tải lên file đánh giá AI', tone: 'is-success' };
  if (normalizeStatus(application.aiScreeningStatus) === 'DONE') {
    return { label: 'Chưa tải lên file đánh giá AI', tone: 'is-warning' };
  }
  return { label: 'Chưa đánh giá bằng AI', tone: 'is-danger' };
}

export function getApplicationQuestionStatus(application: ExtensionApplication) {
  const status = normalizeStatus(application.latestForm?.status ?? application.formStatus);
  if (status === 'SUBMITTED') {
    return { code: 'ANSWERED', label: 'Đã trả lời', tone: 'is-success' } satisfies ApplicationQuestionStatus;
  }
  return { code: 'NOT_ANSWERED', label: 'Chưa trả lời', tone: 'is-warning' } satisfies ApplicationQuestionStatus;
}

export function getApplicationMatchScore(application: ExtensionApplication) {
  const score = application.aiScreeningScore ?? application.mappingScore;
  if (score == null || !Number.isFinite(score)) return null;
  return Math.round(score);
}

export function canUploadApplicationCv(application: ExtensionApplication) {
  return Boolean(application.currentCvDocumentId)
    && application.cvSanitizeStatus?.toUpperCase() === 'SANITIZED'
    && !application.attachmentCvId
    && !application.attachmentCvName;
}

export function getAmisCandidateStageOptions(
  rounds: AmisRecruitmentRound[],
  application: ExtensionApplication,
) {
  if (rounds.length > 0) return rounds;

  const currentName = normalizeOptionalText(application.amisRecruitmentRoundName);
  if (!currentName) return [];

  return [{
    id: application.amisRecruitmentRoundId ?? `current:${currentName}`,
    name: currentName,
    sortOrder: 1,
    roundType: null,
    roundTypeId: null,
    color: null,
  } satisfies AmisRecruitmentRound];
}

export function getAmisCandidateStageIndex(
  rounds: AmisRecruitmentRound[],
  roundId?: string | null,
  roundName?: string | null,
) {
  const normalizedRoundId = normalizeOptionalText(roundId);
  if (normalizedRoundId) {
    const idIndex = rounds.findIndex((round) => round.id === normalizedRoundId);
    if (idIndex >= 0) return idIndex;
  }

  const normalizedName = normalizeAmisStageName(roundName);
  if (!normalizedName) return -1;

  return rounds.findIndex((round) => normalizeAmisStageName(round.name) === normalizedName);
}

export function getCvSourceFilterBucket(application: ExtensionApplication): 'FACEBOOK' | 'VCS_PORTAL' | 'FREELANCER' | 'INTERNAL' | null {
  const normalizedSource = normalizeAmisSourceChannel(application.sourceChannel);
  if (!normalizedSource) return null;
  if (normalizedSource.includes('FACEBOOK')) return 'FACEBOOK';
  if (normalizedSource.includes('VCS') || normalizedSource.includes('PORTAL')) return 'VCS_PORTAL';
  if (normalizedSource.includes('FREELANCER') || normalizedSource === 'OTHER') return 'FREELANCER';
  if (
    normalizedSource.includes('MANUAL')
    || normalizedSource.includes('INTERNAL')
    || normalizedSource.includes('NOIBO')
  ) return 'INTERNAL';
  return null;
}

export function getCvSourceLabel(application: ExtensionApplication) {
  const sourceFilter = getCvSourceFilterBucket(application);
  if (sourceFilter === 'FACEBOOK') return 'Facebook';
  if (sourceFilter === 'VCS_PORTAL') return 'VCS Portal';
  if (sourceFilter === 'FREELANCER') return 'Freelancer';
  if (sourceFilter === 'INTERNAL') return 'Nội bộ';
  return application.sourceChannel ?? 'Chưa xác định';
}

function normalizeStatus(value?: string | null) {
  return value?.toUpperCase().trim() ?? '';
}

function normalizeOptionalText(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function normalizeAmisSourceChannel(value?: string | null) {
  return normalizeOptionalText(value)
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    ?? null;
}

function normalizeAmisStageName(value?: string | null) {
  return normalizeOptionalText(value)
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    ?? null;
}
