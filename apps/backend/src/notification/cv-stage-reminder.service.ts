import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { UserEntity } from '../auth/entities/user.entity';
import {
  AmisApplicationStageReminderEntity,
  AmisHrMappingEntity,
} from '../extension-integration/entities';
import { MailService } from './mail.service';

interface AmisHrMappingInput {
  amisAccountId?: string | null;
  amisAccountName?: string | null;
  hrUserId: string;
}

interface StageTransitionInput {
  applicationId: string;
  amisRecruitmentId: string;
  amisCandidateId: string;
  amisRecruitmentRoundId: string;
  amisRecruitmentRoundName?: string | null;
  candidateAmisUrl?: string | null;
  attractivePersonnelId?: string | null;
  attractivePersonnelName?: string | null;
  actorUserId?: string | null;
}

interface HrRecipient {
  mappingId: string | null;
  userId: string | null;
  email: string | null;
  name: string | null;
}

type ReminderPhase = 'FIRST' | 'SECOND';

@Injectable()
export class CvStageReminderService {
  private readonly logger = new Logger(CvStageReminderService.name);

  constructor(
    @InjectRepository(AmisHrMappingEntity)
    private readonly amisHrMappingRepository: Repository<AmisHrMappingEntity>,
    @InjectRepository(AmisApplicationStageReminderEntity)
    private readonly reminderRepository: Repository<AmisApplicationStageReminderEntity>,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepository: Repository<ApplicationEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async upsertAmisHrMapping(input: AmisHrMappingInput) {
    const amisAccountId = this.optionalText(input.amisAccountId);
    if (!amisAccountId) return null;

    const hrUser = await this.userRepository.findOne({ where: { id: input.hrUserId } });
    if (!hrUser) {
      this.logger.warn(`Cannot map AMIS account ${amisAccountId}: internal HR ${input.hrUserId} was not found.`);
      return null;
    }

    const existing = await this.amisHrMappingRepository.findOne({
      where: { amisAccountId },
    });

    if (existing && existing.hrUserId !== hrUser.id) {
      this.logger.warn(
        `AMIS account ${amisAccountId} is already mapped to HR ${existing.hrUserId}; refusing to overwrite it with ${hrUser.id}.`,
      );
      return existing;
    }

    const mapping = existing ?? this.amisHrMappingRepository.create({
      amisAccountId,
      hrUserId: hrUser.id,
      // New automatic mappings use the current internal HR email until an
      // explicit AMIS email mapping is configured.
      hrEmail: hrUser.email,
      hrName: hrUser.name,
      isActive: true,
      amisAccountName: null,
    });
    mapping.amisAccountName = this.optionalText(input.amisAccountName) ?? mapping.amisAccountName;
    // An existing mapping may have an AMIS recipient email configured by the
    // operator. Syncing AMIS data must not replace it with the Extension user email.
    if (!existing) mapping.hrName = hrUser.name;
    mapping.isActive = true;

    return this.amisHrMappingRepository.save(mapping);
  }

  async recordStageTransition(input: StageTransitionInput) {
    const activeReminder = await this.reminderRepository.findOne({
      where: {
        applicationId: input.applicationId,
        amisRecruitmentId: input.amisRecruitmentId,
        isActive: true,
      },
    });

    const candidateAmisUrl = this.optionalText(input.candidateAmisUrl);
    const stageName = this.optionalText(input.amisRecruitmentRoundName);

    if (activeReminder?.amisRecruitmentRoundId === input.amisRecruitmentRoundId) {
      activeReminder.amisRecruitmentRoundName = stageName ?? activeReminder.amisRecruitmentRoundName;
      activeReminder.candidateAmisUrl = candidateAmisUrl ?? activeReminder.candidateAmisUrl;
      await this.reminderRepository.save(activeReminder);
      return activeReminder;
    }

    if (activeReminder) {
      activeReminder.isActive = false;
      activeReminder.closedAt = new Date();
      await this.reminderRepository.save(activeReminder);
    }

    const recipient = await this.resolveRecipient(input);
    const reminder = this.reminderRepository.create({
      applicationId: input.applicationId,
      amisRecruitmentId: input.amisRecruitmentId,
      amisCandidateId: input.amisCandidateId,
      amisRecruitmentRoundId: input.amisRecruitmentRoundId,
      amisRecruitmentRoundName: stageName,
      stageEnteredAt: new Date(),
      candidateAmisUrl,
      hrMappingId: recipient.mappingId,
      hrUserId: recipient.userId,
      hrEmail: recipient.email,
      hrName: recipient.name,
      isActive: true,
      closedAt: null,
      firstReminderSentAt: null,
      secondReminderSentAt: null,
      lastError: null,
      lastErrorAt: null,
    });

    const saved = await this.reminderRepository.save(reminder);
    this.logger.log(
      `Started AMIS stage reminder cycle for candidate ${input.amisCandidateId}, round ${input.amisRecruitmentRoundId}.`,
    );
    return saved;
  }

  async processDueReminders(now = new Date()) {
    const firstThresholdMs = this.configuredMinutes('CV_STAGE_REMINDER_FIRST_AFTER_MINUTES', 2) * 60_000;
    const secondThresholdMs = this.configuredMinutes('CV_STAGE_REMINDER_SECOND_AFTER_MINUTES', 4) * 60_000;
    const batchWindowMs = this.configuredMinutes('CV_STAGE_REMINDER_BATCH_WINDOW_MINUTES', 1) * 60_000;
    const activeReminders = await this.reminderRepository.find({
      where: [
        { isActive: true, firstReminderSentAt: IsNull() },
        { isActive: true, firstReminderSentAt: Not(IsNull()), secondReminderSentAt: IsNull() },
      ],
      relations: ['application', 'application.candidate', 'application.jobPosting'],
      order: { stageEnteredAt: 'ASC' },
    });

    const firstDue = activeReminders.filter((reminder) =>
      reminder.firstReminderSentAt === null
      && now.getTime() - reminder.stageEnteredAt.getTime() >= firstThresholdMs + batchWindowMs,
    );
    await this.sendGroupedReminders(firstDue, 'FIRST', now);

    const secondDue = activeReminders.filter((reminder) =>
      reminder.firstReminderSentAt !== null
      && reminder.secondReminderSentAt === null
      && now.getTime() - reminder.stageEnteredAt.getTime() >= secondThresholdMs + batchWindowMs
      && now.getTime() - reminder.firstReminderSentAt.getTime() >= batchWindowMs,
    );
    await this.sendGroupedReminders(secondDue, 'SECOND', now);
  }

  private async resolveRecipient(input: StageTransitionInput): Promise<HrRecipient> {
    const amisAccountId = this.optionalText(input.attractivePersonnelId);
    if (amisAccountId) {
      const mapping = await this.amisHrMappingRepository.findOne({
        where: { amisAccountId, isActive: true },
      });
      if (mapping) {
        return {
          mappingId: mapping.id,
          userId: mapping.hrUserId,
          email: mapping.hrEmail,
          name: mapping.hrName ?? mapping.amisAccountName,
        };
      }

      if (input.actorUserId) {
        const learned = await this.upsertAmisHrMapping({
          amisAccountId,
          amisAccountName: input.attractivePersonnelName,
          hrUserId: input.actorUserId,
        });
        if (learned) {
          return {
            mappingId: learned.id,
            userId: learned.hrUserId,
            email: learned.hrEmail,
            name: learned.hrName ?? learned.amisAccountName,
          };
        }
      }
    }

    const application = await this.applicationRepository.findOne({
      where: { id: input.applicationId },
      relations: ['candidate', 'candidate.assignees', 'jobPosting', 'jobPosting.createdBy'],
    });
    const fallbackUser = application?.candidate?.assignees?.[0] ?? application?.jobPosting?.createdBy;
    if (fallbackUser) {
      return {
        mappingId: null,
        userId: fallbackUser.id,
        email: fallbackUser.email,
        name: fallbackUser.name,
      };
    }

    this.logger.warn(
      `No HR mapping found for AMIS candidate ${input.amisCandidateId}; reminder will not have a recipient.`,
    );
    return { mappingId: null, userId: null, email: null, name: null };
  }

  private async sendGroupedReminders(
    reminders: AmisApplicationStageReminderEntity[],
    phase: ReminderPhase,
    now: Date,
  ) {
    const grouped = new Map<string, AmisApplicationStageReminderEntity[]>();
    for (const reminder of reminders) {
      const email = this.optionalText(reminder.hrEmail)?.toLowerCase();
      if (!email) {
        await this.recordFailure(reminder, 'HR email mapping is missing.');
        continue;
      }
      const group = grouped.get(email) ?? [];
      group.push(reminder);
      grouped.set(email, group);
    }

    for (const [email, group] of grouped) {
      const subject = this.buildDigestSubject(group.length, phase);
      const html = this.buildDigestHtml(group, phase, now);
      const text = this.buildDigestText(group, phase, now);
      const sent = await this.mailService.sendMail(email, subject, html, text);

      if (!sent) {
        await Promise.all(group.map((reminder) => this.recordFailure(reminder, 'SMTP send returned false.')));
        continue;
      }

      const sentAt = new Date();
      for (const reminder of group) {
        if (phase === 'FIRST') reminder.firstReminderSentAt = sentAt;
        else reminder.secondReminderSentAt = sentAt;
        reminder.lastError = null;
        reminder.lastErrorAt = null;
        await this.reminderRepository.save(reminder);
      }
      this.logger.log(`Sent ${phase.toLowerCase()} CV stage digest to ${email} for ${group.length} application(s).`);
    }
  }

  private buildDigestSubject(count: number, phase: ReminderPhase) {
    return phase === 'FIRST'
      ? `[Nhắc xử lý CV] Có ${count} hồ sơ đang chờ HR xử lý`
      : `[ƯU TIÊN CAO] Nhắc lần 2: Có ${count} hồ sơ chưa được chuyển vòng`;
  }

  private buildDigestHtml(
    reminders: AmisApplicationStageReminderEntity[],
    phase: ReminderPhase,
    now: Date,
  ) {
    const isSecondReminder = phase === 'SECOND';
    const recipientName = this.escapeHtml(reminders[0]?.hrName ?? 'HR');
    const title = isSecondReminder
      ? 'Ưu tiên xử lý hồ sơ ứng viên'
      : 'Nhắc HR xử lý hồ sơ ứng viên';
    const intro = isSecondReminder
      ? 'Đây là email nhắc lần 2. Các hồ sơ dưới đây vẫn chưa được cập nhật sang vòng tiếp theo trong thời gian quy định.'
      : 'Hệ thống ghi nhận các hồ sơ dưới đây đang chờ được HR kiểm tra và xử lý.';
    const notice = isSecondReminder
      ? '<div style="margin:20px 0;padding:16px 18px;background:#fff1f2;border:1px solid #fda4af;border-left:5px solid #dc2626;border-radius:8px;color:#991b1b"><div style="font-size:15px;font-weight:700;margin-bottom:6px">CẦN ĐƯỢC ƯU TIÊN KIỂM TRA</div><div style="font-size:14px;line-height:22px">Vui lòng mở hồ sơ trên AMIS và cập nhật trạng thái xử lý sớm nhất. Đây là lần nhắc cuối của chu kỳ hiện tại để tránh gửi thông báo lặp lại.</div></div>'
      : '<div style="margin:20px 0;padding:16px 18px;background:#eff6ff;border:1px solid #bfdbfe;border-left:5px solid #2563eb;border-radius:8px;color:#1e3a8a"><div style="font-size:14px;font-weight:700;margin-bottom:6px">LƯU Ý</div><div style="font-size:14px;line-height:22px">Vui lòng kiểm tra hồ sơ và cập nhật vòng xử lý trên AMIS. Khi ứng viên được chuyển vòng, chu kỳ nhắc sẽ được làm mới.</div></div>';
    const rows = reminders.map((reminder) => {
      const candidateName = this.escapeHtml(reminder.application?.candidate?.name ?? reminder.amisCandidateId);
      const jobTitle = this.escapeHtml(reminder.application?.jobPosting?.title ?? reminder.amisRecruitmentId);
      const stageName = this.escapeHtml(reminder.amisRecruitmentRoundName ?? reminder.amisRecruitmentRoundId);
      const elapsed = this.formatElapsed(reminder.stageEnteredAt, now);
      const link = this.optionalText(reminder.candidateAmisUrl);
      const candidateLink = link
        ? `<a href="${this.escapeHtml(link)}" style="display:inline-block;padding:8px 12px;background:#047857;color:#ffffff;text-decoration:none;border-radius:5px;font-size:13px;font-weight:700">Mở hồ sơ AMIS</a>`
        : '<span style="color:#64748b">Chưa có link hồ sơ AMIS</span>';
      return `<tr><td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#0f172a">${candidateName}</td><td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;color:#334155">${jobTitle}</td><td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;color:#334155">${stageName}</td><td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;color:#b45309;font-weight:700;white-space:nowrap">${elapsed}</td><td style="padding:12px 10px;border-bottom:1px solid #e5e7eb">${candidateLink}</td></tr>`;
    }).join('');

    return `<!doctype html><html lang="vi"><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#1e293b"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${isSecondReminder ? 'Ưu tiên xử lý hồ sơ ứng viên chưa được chuyển vòng.' : 'Thông báo hồ sơ ứng viên đang chờ HR xử lý.'}</div><div style="padding:28px 12px"><div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden"><div style="padding:22px 28px;background:${isSecondReminder ? '#991b1b' : '#047857'};color:#ffffff"><div style="font-size:13px;letter-spacing:.4px;font-weight:700;text-transform:uppercase">VCS Recruitment</div><div style="margin-top:8px;font-size:24px;line-height:32px;font-weight:700">${title}</div><div style="margin-top:8px;font-size:14px;line-height:22px;opacity:.95">${isSecondReminder ? 'Thông báo cần được ưu tiên' : 'Thông báo tự động từ hệ thống'}</div></div><div style="padding:28px"><p style="margin:0 0 16px;font-size:16px;line-height:24px">Kính gửi <strong>${recipientName}</strong>,</p><p style="margin:0;font-size:15px;line-height:24px;color:#334155">${intro}</p>${notice}<div style="margin:20px 0;padding:16px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px"><div style="font-size:13px;color:#64748b;text-transform:uppercase;font-weight:700">Tổng số hồ sơ cần kiểm tra</div><div style="margin-top:4px;font-size:30px;line-height:38px;color:${isSecondReminder ? '#b91c1c' : '#047857'};font-weight:700">${reminders.length}</div></div><p style="margin:24px 0 12px;font-size:15px;line-height:24px;font-weight:700;color:#0f172a">Danh sách hồ sơ:</p><div style="overflow-x:auto"><table role="presentation" style="border-collapse:collapse;width:100%;min-width:640px;font-size:13px"><thead><tr style="background:#f8fafc"><th style="padding:12px 10px;border-bottom:2px solid #cbd5e1;text-align:left;color:#475569;font-size:12px;text-transform:uppercase">Ứng viên</th><th style="padding:12px 10px;border-bottom:2px solid #cbd5e1;text-align:left;color:#475569;font-size:12px;text-transform:uppercase">JD</th><th style="padding:12px 10px;border-bottom:2px solid #cbd5e1;text-align:left;color:#475569;font-size:12px;text-transform:uppercase">Vòng hiện tại</th><th style="padding:12px 10px;border-bottom:2px solid #cbd5e1;text-align:left;color:#475569;font-size:12px;text-transform:uppercase">Đã chờ</th><th style="padding:12px 10px;border-bottom:2px solid #cbd5e1;text-align:left;color:#475569;font-size:12px;text-transform:uppercase">Thao tác</th></tr></thead><tbody>${rows}</tbody></table></div><div style="margin-top:24px;padding-top:18px;border-top:1px solid #e2e8f0;font-size:13px;line-height:21px;color:#64748b"><strong style="color:#334155">Lưu ý quan trọng:</strong> Đây là email nhắc tự động. Vui lòng cập nhật trạng thái xử lý trực tiếp trên AMIS. Nếu hồ sơ đã được xử lý, bạn có thể bỏ qua email này; hệ thống sẽ cập nhật chu kỳ nhắc khi nhận được sự kiện chuyển vòng.</div></div><div style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:20px;color:#64748b">Email được gửi tự động từ VCS Recruitment. Vui lòng không trả lời email này.</div></div></div></body></html>`;
  }

  private buildDigestText(
    reminders: AmisApplicationStageReminderEntity[],
    phase: ReminderPhase,
    now: Date,
  ) {
    const isSecondReminder = phase === 'SECOND';
    const recipientName = reminders[0]?.hrName ?? 'HR';
    const title = phase === 'FIRST'
      ? 'Nhắc HR xử lý hồ sơ ứng viên'
      : 'ƯU TIÊN CAO - Nhắc lần 2: hồ sơ ứng viên chưa được xử lý';
    const lines = reminders.map((reminder, index) => {
      const candidate = reminder.application?.candidate?.name ?? reminder.amisCandidateId;
      const job = reminder.application?.jobPosting?.title ?? reminder.amisRecruitmentId;
      const stage = reminder.amisRecruitmentRoundName ?? reminder.amisRecruitmentRoundId;
      const link = reminder.candidateAmisUrl ?? 'Chưa có link hồ sơ AMIS';
      return `${index + 1}. Ứng viên: ${candidate}\n   JD: ${job}\n   Vòng hiện tại: ${stage}\n   Đã chờ: ${this.formatElapsed(reminder.stageEnteredAt, now)}\n   Mở hồ sơ: ${link}`;
    });
    const notice = isSecondReminder
      ? 'CẢNH BÁO ƯU TIÊN: Đây là lần nhắc thứ 2. Vui lòng kiểm tra và cập nhật các hồ sơ dưới đây sớm nhất.'
      : 'Vui lòng kiểm tra và cập nhật trạng thái xử lý các hồ sơ dưới đây trên AMIS.';
    return `Kính gửi ${recipientName},\n\n${title}\n\n${notice}\n\nTổng số hồ sơ cần kiểm tra: ${reminders.length}\n\n${lines.join('\n\n')}\n\nLƯU Ý QUAN TRỌNG:\n- Đây là email nhắc tự động từ VCS Recruitment.\n- Nếu hồ sơ đã được xử lý, bạn có thể bỏ qua email này.\n- Trạng thái cần được cập nhật trực tiếp trên AMIS.\n\nTrân trọng,\nVCS Recruitment`;
  }

  private async recordFailure(reminder: AmisApplicationStageReminderEntity, message: string) {
    reminder.lastError = message;
    reminder.lastErrorAt = new Date();
    await this.reminderRepository.save(reminder);
    this.logger.warn(`CV stage reminder ${reminder.id} was not sent: ${message}`);
  }

  private configuredMinutes(key: string, fallback: number) {
    const value = Number(this.configService.get<string>(key));
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  private formatElapsed(start: Date, now: Date) {
    const minutes = Math.max(1, Math.floor((now.getTime() - start.getTime()) / 60_000));
    return `${minutes} phút`;
  }

  private escapeHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  private optionalText(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized || null;
  }
}
