import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { join } from 'path';
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
  ) {}

  async enqueueForStageTransition(input: CandidateStageTransitionNotificationInput) {
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
        transitionedAt: this.parseTransitionDate(input.changedAt),
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
          this.logger.error(`Candidate stage email processing failed: ${message}`);
        });
      }

      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Candidate stage email was not queued for application ${input.applicationId}: ${message}`,
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
        join(__dirname, 'templates', 'candidate-stage-email.ejs'),
        {
          candidateName: notification.candidateName ?? 'Ứng viên',
          jobTitle: notification.jobTitle ?? 'Vị trí ứng tuyển',
          roundName: notification.amisRecruitmentRoundName ?? 'Vòng tuyển dụng hiện tại',
          transitionedAt: this.formatTransitionDate(notification.transitionedAt),
        },
      );
      const subject = `[VCS Recruitment] Cập nhật trạng thái hồ sơ - ${notification.jobTitle ?? 'Vị trí ứng tuyển'}`;
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
        `Sent candidate stage email for application ${notification.applicationId}, round ${notification.amisRecruitmentRoundId}.`,
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
        `Candidate stage email ${id} failed on attempt ${notification.attemptCount}/${maxAttempts}: ${message}`,
      );
      return false;
    }
  }

  private buildPlainText(notification: AmisCandidateStageNotificationEntity) {
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
