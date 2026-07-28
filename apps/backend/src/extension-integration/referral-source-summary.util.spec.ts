import { BadRequestException } from '@nestjs/common';
import { ApplicationStatus, HrReviewDecisionType } from '../recruitment-common';
import {
  buildReferralSourceMetrics,
  mapReferralApplicationRow,
  normalizeFreelancerPhone,
} from './referral-source-summary.util';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('referral-source-summary.util', () => {
  it('normalizes an optional Freelancer phone and preserves null when empty', () => {
    expect(normalizeFreelancerPhone('  0988 123 456  ')).toBe('0988 123 456');
    expect(normalizeFreelancerPhone('   ')).toBeNull();
    expect(normalizeFreelancerPhone(null)).toBeNull();
  });

  it('rejects a Freelancer phone longer than the storage limit', () => {
    expect(() => normalizeFreelancerPhone('1'.repeat(51))).toThrow(BadRequestException);
  });

  it('calculates total, processing, passed, and pass rate', () => {
    const metrics = buildReferralSourceMetrics([
      {
        processStatus: ApplicationStatus.WAITING_HR_REVIEW,
        hrReceptionStatus: null,
      },
      {
        processStatus: ApplicationStatus.HR_APPROVED,
        hrReceptionStatus: HrReviewDecisionType.APPROVE,
      },
      {
        processStatus: ApplicationStatus.HR_REJECTED,
        hrReceptionStatus: HrReviewDecisionType.REJECT,
      },
    ]);

    expect(metrics).toEqual({ total: 3, processing: 1, passed: 1, passRate: 33 });
  });

  it('maps application details including applied time, evaluation, and assignees', () => {
    const createdAt = new Date('2026-07-20T08:30:00.000Z');
    const updatedAt = new Date('2026-07-21T08:30:00.000Z');
    const row = mapReferralApplicationRow({
      referralId: 'referral-1',
      applicationId: 'application-1',
      candidate: {
        candidateId: 'candidate-1',
        fullName: 'Nguyen Van A',
        assignees: [{ userId: 'user-1', name: 'TA A', email: 'ta.a@viettel.com.vn' }],
      },
      jobPosting: { jobPostingId: 'job-1', title: 'Backend Developer' },
      processStatus: ApplicationStatus.WAITING_HR_REVIEW,
      hrReceptionStatus: null,
      evaluation: 'CV tiềm năng',
      createdAt,
      updatedAt,
    });

    expect(row).toEqual({
      referralId: 'referral-1',
      applicationId: 'application-1',
      candidate: { candidateId: 'candidate-1', fullName: 'Nguyen Van A' },
      jobPosting: { jobPostingId: 'job-1', title: 'Backend Developer' },
      processStatus: ApplicationStatus.WAITING_HR_REVIEW,
      hrReceptionStatus: null,
      evaluation: 'CV tiềm năng',
      appliedAt: createdAt,
      createdAt,
      updatedAt,
      assignees: [{ userId: 'user-1', name: 'TA A', email: 'ta.a@viettel.com.vn' }],
    });
  });
});
