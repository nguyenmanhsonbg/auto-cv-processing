import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import * as cron from 'node-cron';
import { SessionEntity } from '../sessions/entities/session.entity';
import { NotificationService } from './notification.service';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private cronJob: cron.ScheduledTask | null = null;
  private notifiedSessionIds = new Set<string>();

  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessionRepository: Repository<SessionEntity>,
    private readonly notificationService: NotificationService,
  ) {}

  onModuleInit() {
    this.startScheduler();
  }

  onModuleDestroy() {
    this.stopScheduler();
  }

  private startScheduler() {
    // Run every minute to check for upcoming interviews
    this.cronJob = cron.schedule('* * * * *', async () => {
      await this.checkUpcomingInterviews();
    });

    this.logger.log('Interview notification scheduler started (runs every minute)');
  }

  private stopScheduler() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.logger.log('Interview notification scheduler stopped');
    }
  }

  private async checkUpcomingInterviews(): Promise<void> {
    try {
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
      const sixMinutesFromNow = new Date(now.getTime() + 6 * 60 * 1000);

      // Find sessions scheduled between 5 and 6 minutes from now
      // This gives us a 1-minute window to catch interviews and send notifications
      const upcomingSessions = await this.sessionRepository.find({
        where: {
          scheduledAt: Between(fiveMinutesFromNow, sixMinutesFromNow),
        },
        relations: ['candidate'],
      });

      if (upcomingSessions.length > 0) {
        this.logger.log(`Found ${upcomingSessions.length} upcoming interview(s)`);
      }

      for (const session of upcomingSessions) {
        // Skip if we've already notified about this session
        if (this.notifiedSessionIds.has(session.id)) {
          this.logger.debug(`Skipping already notified session ${session.id}`);
          continue;
        }

        try {
          await this.notificationService.sendInterviewNotification(session);
          this.notifiedSessionIds.add(session.id);
          this.logger.log(`Sent notification for session ${session.id} scheduled at ${session.scheduledAt}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to send notification for session ${session.id}: ${errorMessage}`);
        }
      }

      // Clean up old notified session IDs (older than 1 hour to prevent memory leak)
      this.cleanupOldNotifications();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error checking upcoming interviews: ${errorMessage}`);
    }
  }

  private cleanupOldNotifications() {
    // Keep the set size manageable by clearing it periodically
    // In production, you'd want to store this in Redis or a database
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Simple cleanup: if set is too large, clear it
    // This is safe because we check sessions in a 5-6 minute window
    if (this.notifiedSessionIds.size > 1000) {
      this.logger.log('Clearing notification cache to prevent memory leak');
      this.notifiedSessionIds.clear();
    }
  }
}
