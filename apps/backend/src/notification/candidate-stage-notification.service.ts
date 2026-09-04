import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { join } from 'node:path';
import {
  In,
  IsNull,
  LessThan,
  LessThanOrEqual,
  Repository,
} from 'typeorm';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ejs: { renderFile(path: string, data?: Record<string, unknown>): Promise<string> } = require('ejs');

import { ApplicationEntity } from '../applications/entities/application.entity';
import {
  AmisCandidateStageNotificationEntity,
  CandidateStageNotificationStatus,
} from './entities';
import { type InterviewSchedule, InterviewScheduleService } from './interview-schedule.service';
import { MailService } from './mail.service';

export interface CandidateStageTransitionNotificationInput {
  applicationId: string;
  amisRecruitmentId: string;
  amisCandidateId: string;
  amisRecruitmentRoundId: string;
  amisRecruitmentRoundName?: string | null;
  changedAt?: string | null;
}

const RETRYABLE_STATUSES: CandidateStageNotificationStatus[] = ['PENDING', 'FAILED'];
const EMAIL_BRAND_NAME = 'VCS';
const EMAIL_COMPANY_NAME = 'VCS Recruitment';

@Injectable()
export class CandidateStageNotificationService {
  private readonly logger = new Logger(CandidateStageNotificationService.name);

  constructor(
    @InjectRepository(AmisCandidateStageNotificationEntity)
    private readonly notificationRepository: Repository<AmisCandidateStageNotificationEntity>,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepository: Repository<ApplicationEntity>,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly interviewScheduleService: InterviewScheduleService,
  ) {}

  async enqueueForStageTransition(input: CandidateStageTransitionNotificationInput) {
    return this.enqueueNotification(input, null, this.parseTransitionDate(input.changedAt));
  }

  async enqueueForInterviewTransition(input: CandidateStageTransitionNotificationInput) {
    const transitionedAt = this.parseTransitionDate(input.changedAt);
    const schedule = this.interviewScheduleService.buildSchedule(transitionedAt);
    return this.enqueueNotification(input, schedule, transitionedAt);
  }

  private async enqueueNotification(
    input: CandidateStageTransitionNotificationInput,
    interviewSchedule: InterviewSchedule | null,
    transitionedAt: Date,
  ) {
    try {
      const existing = await this.notificationRepository.findOne({
        where: {
          applicationId: input.applicationId,
          amisRecruitmentId: input.amisRecruitmentId,
          amisRecruitmentRoundId: input.amisRecruitmentRoundId,
        },
      });
      if (existing) return existing;

      const application = await this.applicationRepository.findOne({
        where: { id: input.applicationId },
        relations: ['candidate', 'jobPosting'],
      });
      if (!application) {
        this.logger.warn(
          `Cannot queue candidate stage email: application ${input.applicationId} was not found.`,
        );
        return null;
      }

      const candidateEmail = this.normalizeEmail(application.candidate?.email);
      const notification = this.notificationRepository.create({
        applicationId: application.id,
        amisRecruitmentId: input.amisRecruitmentId,
        amisCandidateId: input.amisCandidateId,
        amisRecruitmentRoundId: input.amisRecruitmentRoundId,
        amisRecruitmentRoundName: this.optionalText(input.amisRecruitmentRoundName),
        candidateEmail: candidateEmail ?? '',
        candidateName: this.optionalText(application.candidate?.name),
        jobTitle: this.optionalText(application.jobPosting?.title),
        transitionedAt,
        interviewScheduledAt: interviewSchedule?.startsAt ?? null,
        interviewEndsAt: interviewSchedule?.endsAt ?? null,
        interviewTimezone: interviewSchedule?.timezone ?? null,
        interviewDurationMinutes: interviewSchedule?.durationMinutes ?? null,
        status: candidateEmail ? 'PENDING' : 'SKIPPED_NO_EMAIL',
        attemptCount: 0,
        lastAttemptAt: null,
        nextAttemptAt: null,
        sentAt: null,
        lastError: candidateEmail ? null : 'Candidate email is missing or invalid.',
      });

      let saved: AmisCandidateStageNotificationEntity;
      try {
        saved = await this.notificationRepository.save(notification);
      } catch (error) {
        if (!this.isUniqueViolation(error)) throw error;
        return this.notificationRepository.findOne({
          where: {
            applicationId: input.applicationId,
            amisRecruitmentId: input.amisRecruitmentId,
            amisRecruitmentRoundId: input.amisRecruitmentRoundId,
          },
        });
      }

      if (saved.status === 'PENDING') {
        void this.processNotification(saved.id).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Candidate notification processing failed: ${message}`);
        });
      } else if (saved.status === 'SKIPPED_NO_EMAIL') {
        this.logger.warn(
          `Skipped ${this.notificationKind(saved)} email for application ${saved.applicationId}, candidate ${saved.amisCandidateId}, round ${saved.amisRecruitmentRoundId}: no valid candidate email.`,
        );
      }

      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Candidate notification was not queued for application ${input.applicationId}: ${message}`,
      );
      return null;
    }
  }

  async processDueNotifications(now = new Date()) {
    const maxAttempts = this.configuredAttempts('CANDIDATE_STAGE_EMAIL_MAX_ATTEMPTS', 3);
    const staleSendingBefore = new Date(
      now.getTime()
        - this.configuredMinutes('CANDIDATE_STAGE_EMAIL_STALE_SENDING_MINUTES', 10) * 60_000,
    );
    await this.notificationRepository.update(
      {
        status: 'SENDING',
        lastAttemptAt: LessThanOrEqual(staleSendingBefore),
      },
      {
        status: 'FAILED',
        nextAttemptAt: now,
        lastError: 'Recovered a stale SENDING notification after the worker restarted.',
      },
    );
    const dueNotifications = await this.notificationRepository.find({
      where: [
        {
          status: In(RETRYABLE_STATUSES),
          attemptCount: LessThan(maxAttempts),
          nextAttemptAt: IsNull(),
        },
        {
          status: In(RETRYABLE_STATUSES),
          attemptCount: LessThan(maxAttempts),
          nextAttemptAt: LessThanOrEqual(now),
        },
      ],
      order: { createdAt: 'ASC' },
      take: 100,
    });

    for (const notification of dueNotifications) {
      await this.processNotification(notification.id, now);
    }
  }

  private async processNotification(id: string, now = new Date()) {
    const maxAttempts = this.configuredAttempts('CANDIDATE_STAGE_EMAIL_MAX_ATTEMPTS', 3);
    const claimed = await this.notificationRepository
      .createQueryBuilder()
      .update(AmisCandidateStageNotificationEntity)
      .set({
        status: 'SENDING',
        lastAttemptAt: now,
        attemptCount: () => '"attempt_count" + 1',
      })
      .where('"id" = :id', { id })
      .andWhere('"status" IN (:...statuses)', { statuses: RETRYABLE_STATUSES })
      .andWhere('"attempt_count" < :maxAttempts', { maxAttempts })
      .andWhere('("next_attempt_at" IS NULL OR "next_attempt_at" <= :now)', { now })
      .execute();

    if (!claimed.affected) return false;

    const notification = await this.notificationRepository.findOne({ where: { id } });
    if (!notification) return false;

    try {
      const html = await ejs.renderFile(
        join(__dirname, 'templates', this.templateName(notification)),
        this.templateData(notification),
      );
      const subject = this.subjectFor(notification);
      const sent = await this.mailService.sendMail(
        notification.candidateEmail,
        subject,
        html,
        this.buildPlainText(notification),
      );

      if (!sent) throw new Error('SMTP send returned false.');

      await this.notificationRepository.update(id, {
        status: 'SENT',
        sentAt: new Date(),
        nextAttemptAt: null,
        lastError: null,
      });
      this.logger.log(
        `Sent ${this.notificationKind(notification)} email for application ${notification.applicationId}, candidate ${notification.amisCandidateId}, email ${notification.candidateEmail}, round ${notification.amisRecruitmentRoundId}.`,
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryDelayMinutes = this.configuredMinutes('CANDIDATE_STAGE_EMAIL_RETRY_MINUTES', 1);
      const shouldRetry = notification.attemptCount < maxAttempts;
      const nextAttemptAt = shouldRetry
        ? new Date(Date.now() + retryDelayMinutes * 60_000)
        : null;

      await this.notificationRepository.update(id, {
        status: 'FAILED',
        nextAttemptAt,
        lastError: message,
      });
      this.logger.warn(
        `${this.notificationKind(notification)} email ${id} failed for application ${notification.applicationId}, candidate ${notification.amisCandidateId}, round ${notification.amisRecruitmentRoundId} on attempt ${notification.attemptCount}/${maxAttempts}: ${message}`,
      );
      return false;
    }
  }

  private buildPlainText(notification: AmisCandidateStageNotificationEntity) {
    if (this.hasInterviewSchedule(notification)) {
      return this.buildInterviewPlainText(notification);
    }

    return [
      `Kính chào ${notification.candidateName ?? 'Ứng viên'},`,
      '',
      `Hồ sơ ứng tuyển vị trí ${notification.jobTitle ?? 'Vị trí ứng tuyển'} của bạn đã được cập nhật.`,
      `Vòng tuyển dụng hiện tại: ${notification.amisRecruitmentRoundName ?? 'Vòng tuyển dụng hiện tại'}`,
      `Thời điểm cập nhật: ${this.formatTransitionDate(notification.transitionedAt)}`,
      '',
      'Đây là email thông báo tự động từ hệ thống tuyển dụng VCS.',
      'Bộ phận tuyển dụng sẽ liên hệ với bạn khi có thông tin tiếp theo.',
      '',
      'Trân trọng,',
      'VCS Recruitment',
    ].join('\n');
  }

  private buildInterviewPlainText(notification: AmisCandidateStageNotificationEntity) {
    const timezone = notification.interviewTimezone as string;
    const startsAt = notification.interviewScheduledAt as Date;
    const endsAt = notification.interviewEndsAt as Date;
    const durationMinutes = notification.interviewDurationMinutes as number;
    const jobTitle = notification.jobTitle ?? 'Vị trí ứng tuyển';
    const roundName = notification.amisRecruitmentRoundName ?? 'Vòng phỏng vấn';

    return [
      `Kính chào ${notification.candidateName ?? 'Ứng viên'},`,
      '',
      `VCS Recruitment trân trọng mời bạn tham gia phỏng vấn cho vị trí ${jobTitle}.`,
      '',
      `Vòng phỏng vấn: ${roundName}`,
      `Thời gian: ${this.formatInterviewDate(startsAt, timezone)} từ ${this.formatInterviewTime(startsAt, timezone)} đến ${this.formatInterviewTime(endsAt, timezone)} (${timezone})`,
      `Thời lượng dự kiến: ${durationMinutes} phút`,
      '',
      'Thông tin địa điểm hoặc hình thức phỏng vấn sẽ được bộ phận tuyển dụng thông báo nếu có.',
      '',
      'Trân trọng,',
      EMAIL_COMPANY_NAME,
    ].join('\n');
  }

  private templateName(notification: AmisCandidateStageNotificationEntity) {
    return this.hasInterviewSchedule(notification)
      ? 'interview-invitation-email.ejs'
      : 'candidate-stage-email.ejs';
  }

  private templateData(notification: AmisCandidateStageNotificationEntity) {
    const baseData = {
      candidateName: notification.candidateName ?? 'Ứng viên',
      jobTitle: notification.jobTitle ?? 'Vị trí ứng tuyển',
      roundName: notification.amisRecruitmentRoundName ?? 'Vòng tuyển dụng hiện tại',
      transitionedAt: this.formatTransitionDate(notification.transitionedAt),
    };
    if (!this.hasInterviewSchedule(notification)) return baseData;

    const timezone = notification.interviewTimezone as string;
    const startsAt = notification.interviewScheduledAt as Date;
    const endsAt = notification.interviewEndsAt as Date;
    const durationMinutes = notification.interviewDurationMinutes as number;
    return {
      ...baseData,
      interviewDate: this.formatInterviewDate(startsAt, timezone),
      interviewStart: this.formatInterviewTime(startsAt, timezone),
      interviewEnd: this.formatInterviewTime(endsAt, timezone),
      interviewTimezone: timezone,
      interviewDurationMinutes: durationMinutes,
    };
  }

  private subjectFor(notification: AmisCandidateStageNotificationEntity) {
    const jobTitle = notification.jobTitle ?? 'Vị trí ứng tuyển';
    if (this.hasInterviewSchedule(notification)) {
      return `[${EMAIL_BRAND_NAME}] Thư mời phỏng vấn – ${jobTitle}`;
    }

    return `[${EMAIL_COMPANY_NAME}] Cập nhật trạng thái hồ sơ - ${jobTitle}`;
  }

  private notificationKind(notification: AmisCandidateStageNotificationEntity) {
    return this.hasInterviewSchedule(notification) ? 'Interview invitation' : 'Candidate stage';
  }

  private hasInterviewSchedule(notification: AmisCandidateStageNotificationEntity) {
    return notification.interviewScheduledAt !== null
      && notification.interviewEndsAt !== null
      && Boolean(notification.interviewTimezone)
      && notification.interviewDurationMinutes !== null;
  }

  private configuredAttempts(key: string, fallback: number) {
    const value = Number(this.configService.get<string>(key));
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  private configuredMinutes(key: string, fallback: number) {
    const value = Number(this.configService.get<string>(key));
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  private parseTransitionDate(value: string | null | undefined) {
    if (!value) return new Date();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private formatTransitionDate(value: Date) {
    return value.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  private formatInterviewDate(value: Date, timezone: string) {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: timezone,
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(value);
  }

  private formatInterviewTime(value: Date, timezone: string) {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(value);
  }

  private normalizeEmail(value: string | null | undefined) {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) return null;

    const atIndex = normalized.indexOf('@');
    const domainDotIndex = normalized.lastIndexOf('.');
    const hasWhitespace = [...normalized].some((character) => (
      character === ' ' || character === '\t' || character === '\r' || character === '\n'
    ));
    return atIndex > 0
      && atIndex === normalized.lastIndexOf('@')
      && domainDotIndex > atIndex + 1
      && domainDotIndex < normalized.length - 1
      && !hasWhitespace
      ? normalized
      : null;
  }

  private optionalText(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized || null;
  }

  private isUniqueViolation(error: unknown) {
    return typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: unknown }).code === '23505';
  }
}
