import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import TelegramBot from 'node-telegram-bot-api';
import { SessionEntity } from '../sessions/entities/session.entity';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private bot: TelegramBot | null = null;
  private adminChatIds: string[] = [];

  constructor(private readonly configService: ConfigService) {
    this.initializeTelegramBot();
  }

  private initializeTelegramBot() {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    const chatIds = this.configService.get<string>('TELEGRAM_ADMIN_CHAT_IDS');

    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not configured - Telegram notifications disabled');
      return;
    }

    if (!chatIds) {
      this.logger.warn('TELEGRAM_ADMIN_CHAT_IDS not configured - no admins will receive notifications');
      return;
    }

    try {
      this.bot = new TelegramBot(token, { polling: false });
      this.adminChatIds = chatIds.split(',').map((id) => id.trim()).filter(Boolean);
      this.logger.log(`Telegram bot initialized with ${this.adminChatIds.length} admin chat IDs`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize Telegram bot: ${message}`);
    }
  }

  async sendInterviewNotification(session: SessionEntity): Promise<void> {
    if (!this.bot || this.adminChatIds.length === 0) {
      this.logger.warn('Telegram bot not configured - skipping notification');
      return;
    }

    const message = this.formatInterviewMessage(session);

    const results = await Promise.allSettled(
      this.adminChatIds.map(async (chatId) => {
        try {
          await this.bot!.sendMessage(chatId, message, { parse_mode: 'Markdown' });
          this.logger.log(`Notification sent to Telegram chat ${chatId} for session ${session.id}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to send Telegram message to ${chatId}: ${errorMessage}`);
          throw error;
        }
      }),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      this.logger.warn(`Failed to send ${failed}/${this.adminChatIds.length} notifications`);
    }
  }

  private formatInterviewMessage(session: SessionEntity): string {
    const candidateName = session.candidate?.name || 'Unknown Candidate';
    const scheduledTime = session.scheduledAt
      ? new Date(session.scheduledAt).toLocaleString('en-US', {
          timeZone: 'Asia/Ho_Chi_Minh',
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : 'Not specified';

    const meetingLink = session.meetingLink || 'No meeting link provided';
    const position = session.templatePosition || 'Backend Developer';
    const level = session.targetLevel || 'ENTRY';

    return `🔔 *Interview Starting Soon*

*Candidate:* ${candidateName}
*Position:* ${position}
*Level:* ${level}
*Scheduled Time:* ${scheduledTime}

*Meeting Link:* ${meetingLink}

_This interview will start in approximately 5 minutes._`;
  }
}
