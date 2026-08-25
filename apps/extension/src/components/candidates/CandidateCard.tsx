import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { AmisApplicationsForRecruitment, AmisRecruitmentRound } from '@/types/types';
import type {
  InterviewCommittee,
  InterviewEvaluationSummary,
  InterviewEvaluationTemplate,
} from '@/types/types';
import { CandidateAvatar } from './CandidateAvatar';
import { SourceIcon } from '@/components/icons';
import {
  createInterviewEvaluationCase,
  getInterviewEvaluationSummary,
  listInterviewCommittees,
} from '@/lib/api-client';
import { FRONTEND_BASE_URL } from '@/lib/config';

export type ExtensionApplication = AmisApplicationsForRecruitment['applications'][number];

export type ApplicationQuestionStatusCode = 'ANSWERED' | 'NOT_ANSWERED';
export type ApplicationQuestionStatus = {
  code: ApplicationQuestionStatusCode;
  label: string;
  tone: 'is-success' | 'is-warning' | 'is-danger' | 'is-muted';
};

export type CandidateCardProps = Readonly<{
  application: ExtensionApplication;
  token: string | null;
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
}>;

export function CandidateCard({
  application,
  token,
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
  const [evaluationSummary, setEvaluationSummary] = useState<InterviewEvaluationSummary | null>(null);
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [evaluationDialogOpen, setEvaluationDialogOpen] = useState(false);
  const [evaluationTemplate, setEvaluationTemplate] = useState<InterviewEvaluationTemplate>('BM04.1_KNL');
  const [committees, setCommittees] = useState<InterviewCommittee[]>([]);
  const [selectedCommitteeId, setSelectedCommitteeId] = useState<string | null>(null);
  const [expandedCommitteeId, setExpandedCommitteeId] = useState<string | null>(null);
  const [selectedCommitteeUserIds, setSelectedCommitteeUserIds] = useState<string[]>([]);
  const [committeeLoading, setCommitteeLoading] = useState(false);
  const [committeeLoaded, setCommitteeLoaded] = useState(false);
  const [evaluationCreating, setEvaluationCreating] = useState(false);
  const evaluationActionButtonRef = useRef<HTMLButtonElement>(null);
  const evaluationCloseButtonRef = useRef<HTMLButtonElement>(null);
  const candidateStages = getAmisCandidateStageOptions(amisRecruitmentRounds, application);
  const currentStageIndex = getAmisCandidateStageIndex(
    candidateStages,
    application.amisRecruitmentRoundId,
    application.amisRecruitmentRoundName,
  );
  const currentAmisRound = candidateStages[currentStageIndex];
  const isInterviewRound = isAmisInterviewRound(currentAmisRound);
  const evaluationStartRound = getEvaluationStartRound(application, currentAmisRound, isInterviewRound);
  const canInitializeEvaluation = Boolean(evaluationStartRound);
  const evaluationRoundName = getEvaluationRoundName(
    isInterviewRound,
    currentAmisRound,
    evaluationSummary,
    evaluationStartRound,
  );
  const evaluationVisible = isInterviewRound
    || Boolean(application.interviewEvaluationStartedAt)
    || Boolean(evaluationSummary?.hasCase);

  useEffect(() => {
    if (!evaluationDialogOpen) return undefined;
    evaluationCloseButtonRef.current?.focus();
    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setEvaluationDialogOpen(false);
      }
    };
    document.addEventListener('keydown', handleDialogKeyDown);
    return () => {
      document.removeEventListener('keydown', handleDialogKeyDown);
      evaluationActionButtonRef.current?.focus();
    };
  }, [evaluationDialogOpen]);

  useEffect(() => {
    let disposed = false;
    if (!token) {
      setEvaluationSummary(null);
      setEvaluationLoading(false);
      return undefined;
    }

    setEvaluationLoading(true);
    setEvaluationError(null);
    getInterviewEvaluationSummary(token, application.applicationId)
      .then((summary) => {
        if (!disposed) setEvaluationSummary(summary);
      })
      .catch(() => {
        if (!disposed) setEvaluationError('Không tải được trạng thái phiếu đánh giá.');
      })
      .finally(() => {
        if (!disposed) setEvaluationLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, [
    application.applicationId,
    application.amisRecruitmentRoundId,
    application.amisRecruitmentRoundName,
    application.interviewEvaluationStartedAt,
    token,
  ]);

  useEffect(() => {
    if (!canInitializeEvaluation || !evaluationDialogOpen || evaluationSummary?.hasCase || !token || committeeLoaded) return undefined;
    let disposed = false;
    setCommitteeLoading(true);
    listInterviewCommittees(token)
      .then((items) => {
        if (!disposed) setCommittees(items);
      })
      .catch(() => {
        if (!disposed) setEvaluationError('Không tải được danh sách hội đồng chuyên môn.');
      })
      .finally(() => {
        if (!disposed) {
          setCommitteeLoading(false);
          setCommitteeLoaded(true);
        }
      });
    return () => {
      disposed = true;
    };
  }, [canInitializeEvaluation, committeeLoaded, evaluationDialogOpen, evaluationSummary?.hasCase, token]);

  const evaluationActionLabel = getInterviewEvaluationActionLabel(evaluationSummary, evaluationRoundName);

  function openEvaluationPage() {
    const evaluationUrl = `${FRONTEND_BASE_URL}/interview-evaluations/${encodeURIComponent(application.applicationId)}`;
    if (chrome.tabs?.create) {
      chrome.tabs.create({ url: evaluationUrl }).catch(() => window.open(evaluationUrl, '_blank', 'noopener,noreferrer'));
      return;
    }
    window.open(evaluationUrl, '_blank', 'noopener,noreferrer');
  }

  function handleEvaluationAction() {
    if (!evaluationSummary || evaluationLoading) return;
    if (evaluationSummary.hasCase) {
      openEvaluationPage();
      return;
    }
    if (!canInitializeEvaluation) return;
    setSelectedCommitteeId(null);
    setExpandedCommitteeId(null);
    setSelectedCommitteeUserIds([]);
    setCommitteeLoaded(false);
    setEvaluationError(null);
    setEvaluationDialogOpen(true);
  }

  async function handleCreateEvaluationCase() {
    if (!evaluationStartRound) return;
    if (!token || evaluationCreating || !selectedCommitteeId || selectedCommitteeUserIds.length === 0) {
      if (!selectedCommitteeId) {
        setEvaluationError('Vui lòng chọn một hội đồng chuyên môn.');
      } else if (selectedCommitteeUserIds.length === 0) {
        setEvaluationError('Vui lòng chọn ít nhất một thành viên HĐCM.');
      }
      return;
    }
    setEvaluationCreating(true);
    setEvaluationError(null);
    try {
      await createInterviewEvaluationCase(token, application.applicationId, {
        roundName: evaluationStartRound.name,
        amisRoundId: evaluationStartRound.id,
        amisRoundType: evaluationStartRound.roundType ?? undefined,
        amisSortOrder: evaluationStartRound.sortOrder,
        template: evaluationTemplate,
        committeeId: selectedCommitteeId,
        committeeUserIds: selectedCommitteeUserIds,
      });
      setEvaluationDialogOpen(false);
      openEvaluationPage();
      const summary = await getInterviewEvaluationSummary(token, application.applicationId);
      setEvaluationSummary(summary);
    } catch {
      setEvaluationError('Không thể tạo phiếu đánh giá. Vui lòng thử lại.');
    } finally {
      setEvaluationCreating(false);
    }
  }

  function handleCommitteeSelect(committee: InterviewCommittee) {
    setSelectedCommitteeId(committee.id);
    setExpandedCommitteeId(committee.id);
    setSelectedCommitteeUserIds(committee.members.map((member) => member.id));
    setEvaluationError(null);
  }

  function toggleCommitteeMember(userId: string) {
    setSelectedCommitteeUserIds((currentIds) => currentIds.includes(userId)
      ? currentIds.filter((currentId) => currentId !== userId)
      : [...currentIds, userId]);
    setEvaluationError(null);
  }

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
             <span className="cv-candidate-contact">
               {[application.email, application.mobile].filter(Boolean).join(' • ') || 'No contact'}
             </span>
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
          {evaluationVisible ? <div className="cv-candidate-evaluation">
            <div className="cv-candidate-evaluation-heading">
              <div>
                <small>PHIẾU ĐÁNH GIÁ PHỎNG VẤN</small>
                <strong>
                  {evaluationLoading
                    ? 'Đang tải...'
                    : evaluationRoundName}
                </strong>
              </div>
              {evaluationSummary?.hasCase ? (
                <span className={`cv-evaluation-status is-${getEvaluationStatusTone(evaluationSummary.currentRound.status)}`}>
                  {getEvaluationStatusLabel(evaluationSummary.currentRound.status)}
                </span>
              ) : null}
            </div>
            <div className="cv-candidate-evaluation-meta">
              {evaluationSummary?.hasCase
                ? `Đã gửi ${evaluationSummary.reviewerProgress.submitted}/${evaluationSummary.reviewerProgress.total} đánh giá`
                : 'Chưa khởi tạo phiếu cho ứng viên này'}
            </div>
            <button
              type="button"
              className="cv-evaluation-button"
              ref={evaluationActionButtonRef}
              disabled={evaluationLoading || !evaluationSummary?.canView || !canInitializeEvaluation}
              onClick={handleEvaluationAction}
            >
              {evaluationActionLabel}
            </button>
            {evaluationError ? <span className="cv-evaluation-error">{evaluationError}</span> : null}
          </div> : null}
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
        {canInitializeEvaluation && evaluationDialogOpen ? (
          <div className="interview-evaluation-confirm-backdrop" role="presentation">
            <section className="interview-evaluation-confirm-modal" role="dialog" aria-modal="true" aria-labelledby={`evaluation-dialog-title-${application.applicationId}`}>
              <div className="interview-evaluation-confirm-header">
                <div>
                  <small>KHỞI TẠO PHIẾU</small>
                  <h2 id={`evaluation-dialog-title-${application.applicationId}`}>Đánh giá {evaluationRoundName}</h2>
                </div>
                <button ref={evaluationCloseButtonRef} type="button" className="interview-evaluation-close-button" onClick={() => setEvaluationDialogOpen(false)} aria-label="Đóng">
                  ×
                </button>
              </div>
              <div className="interview-evaluation-confirm-grid">
                <div><span>Ứng viên</span><strong>{application.candidateName}</strong></div>
                <div><span>JD</span><strong>{evaluationSummary?.job.title ?? 'Chưa xác định'}</strong></div>
                <div><span>Vòng</span><strong>{evaluationRoundName}</strong></div>
                <label>
                  <span>Mẫu đánh giá</span>
                  <select value={evaluationTemplate} onChange={(event) => setEvaluationTemplate(event.target.value as InterviewEvaluationTemplate)}>
                    <option value="BM04.1_KNL">BM04.1 - KNL</option>
                    <option value="BM04.2_CAREERPATH">BM04.2 - Careerpath</option>
                  </select>
                </label>
              </div>
              <div className="interview-evaluation-committee-picker">
                <span className="interview-evaluation-field-label">Hội đồng chuyên môn</span>
                {committeeLoading ? <p>Đang tải danh sách hội đồng...</p> : null}
                {!committeeLoading && committees.length === 0 ? <p>Chưa có hội đồng chuyên môn đang hoạt động.</p> : null}
                {committees.map((committee) => (
                  <div key={committee.id} className="interview-evaluation-committee-option">
                    <div className="interview-evaluation-committee-option-header">
                      <label className="interview-evaluation-committee-choice">
                        <input
                          type="radio"
                          name={`interview-committee-${application.applicationId}`}
                          checked={selectedCommitteeId === committee.id}
                          onChange={() => handleCommitteeSelect(committee)}
                        />
                        <span>
                          <strong>{committee.name}</strong>
                          <small>{committee.memberCount} thành viên · {selectedCommitteeId === committee.id ? `${selectedCommitteeUserIds.length} người được chọn` : 'Chọn để phân công'}</small>
                        </span>
                      </label>
                      <button
                        type="button"
                        className="interview-evaluation-expand-button"
                        aria-expanded={expandedCommitteeId === committee.id}
                        aria-controls={`committee-members-${application.applicationId}-${committee.id}`}
                        aria-label={`${expandedCommitteeId === committee.id ? 'Thu gọn' : 'Mở rộng'} ${committee.name}`}
                        onClick={() => setExpandedCommitteeId((currentId) => currentId === committee.id ? null : committee.id)}
                      >
                        {expandedCommitteeId === committee.id ? '⌃' : '⌄'}
                      </button>
                    </div>
                    {expandedCommitteeId === committee.id ? (
                      <div id={`committee-members-${application.applicationId}-${committee.id}`} className="interview-evaluation-committee-members">
                        {committee.members.map((member) => (
                          <label key={member.id} className="interview-evaluation-member-option">
                            <input
                              type="checkbox"
                              checked={selectedCommitteeUserIds.includes(member.id)}
                              disabled={selectedCommitteeId !== committee.id}
                              onChange={() => toggleCommitteeMember(member.id)}
                            />
                            <span>
                              <strong>{member.name}</strong>
                              <small>{member.email}</small>
                            </span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="interview-evaluation-confirm-actions">
                <button type="button" className="interview-evaluation-secondary-button" onClick={() => setEvaluationDialogOpen(false)}>Hủy</button>
                <button type="button" className="interview-evaluation-primary-button" disabled={evaluationCreating || committeeLoading || !selectedCommitteeId || selectedCommitteeUserIds.length === 0} onClick={handleCreateEvaluationCase}>
                  {evaluationCreating ? 'Đang tạo...' : 'Tiếp tục đánh giá'}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </li>
  );
}

const AMIS_INTERVIEW_ROUND_TYPE = 3;

function isAmisInterviewRound(round?: AmisRecruitmentRound) {
  return round?.roundType === AMIS_INTERVIEW_ROUND_TYPE;
}

function getEvaluationStartRound(
  application: ExtensionApplication,
  currentAmisRound: AmisRecruitmentRound | undefined,
  isInterviewRound: boolean,
) {
  if (application.interviewEvaluationStartedAt && application.interviewEvaluationRoundId) {
    return {
      id: application.interviewEvaluationRoundId,
      name: application.interviewEvaluationRoundName ?? 'Vòng phỏng vấn',
      roundType: application.interviewEvaluationRoundType ?? AMIS_INTERVIEW_ROUND_TYPE,
      sortOrder: application.interviewEvaluationRoundSortOrder ?? 1,
      roundTypeId: null,
      color: null,
    } satisfies AmisRecruitmentRound;
  }

  return isInterviewRound ? currentAmisRound : undefined;
}

function getEvaluationRoundName(
  isInterviewRound: boolean,
  currentAmisRound: AmisRecruitmentRound | undefined,
  summary: InterviewEvaluationSummary | null,
  evaluationStartRound: AmisRecruitmentRound | undefined,
) {
  if (isInterviewRound && currentAmisRound) return currentAmisRound.name;
  if (summary?.hasCase) return summary.currentRound.name;
  if (evaluationStartRound) return evaluationStartRound.name;
  return 'Vòng phỏng vấn';
}

function getInterviewEvaluationActionLabel(summary: InterviewEvaluationSummary | null, roundName: string) {
  if (!summary) return `Đánh giá ${roundName}`;
  if (!summary.hasCase) return `Đánh giá ${roundName}`;
  switch (summary.currentRound.status) {
    case 'DRAFT':
    case 'NEEDS_REVISION':
      return summary.currentRound.status === 'DRAFT' ? 'Tiếp tục đánh giá' : 'Bổ sung đánh giá';
    case 'COMPLETED':
    case 'LOCKED':
      return 'Xem phiếu đánh giá';
    case 'WAITING_COMMITTEE':
    case 'IN_REVIEW':
    case 'WAITING_AGGREGATION':
      return 'Xem tiến độ';
    default:
      return `Đánh giá vòng ${summary.currentRound.name}`;
  }
}

function getEvaluationStatusLabel(status: string | null) {
  if (!status) return 'Chưa khởi tạo';
  const labels: Record<string, string> = {
    READY_TO_EVALUATE: 'Sẵn sàng đánh giá',
    DRAFT: 'Bản nháp',
    WAITING_COMMITTEE: 'Chờ HĐCM',
    IN_REVIEW: 'Đang đánh giá',
    WAITING_AGGREGATION: 'Chờ tổng hợp',
    NEEDS_REVISION: 'Cần bổ sung',
    COMPLETED: 'Đã hoàn tất',
    LOCKED: 'Đã khóa',
  };
  return labels[status] ?? status;
}

function getEvaluationStatusTone(status: string | null) {
  if (status === 'COMPLETED' || status === 'LOCKED') return 'success';
  if (status === 'WAITING_COMMITTEE' || status === 'WAITING_AGGREGATION') return 'warning';
  return 'active';
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
