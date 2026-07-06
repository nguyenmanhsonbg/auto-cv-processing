import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const host = this.configService.get<string>('MAIL_HOST');
    const port = this.configService.get<number>('MAIL_PORT') || 587;
    const user = this.configService.get<string>('MAIL_USER');
    const pass = this.configService.get<string>('MAIL_PASS');

    if (!user || !pass) {
      this.logger.warn('SMTP Mail service not configured - SMTP sending disabled');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: host || 'smtp.gmail.com',
        port: Number(port),
        secure: Number(port) === 465, // true for 465, false for 587
        auth: {
          user,
          pass,
        },
      });
      this.logger.log(`SMTP Mail service initialized for: ${user}`);
    } catch (err: any) {
      this.logger.error(`Failed to initialize SMTP transporter: ${err.message}`);
    }
  }

  async sendMail(to: string, subject: string, html: string, text?: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn('SMTP Transporter not initialized. Cannot send email.');
      return false;
    }

    const from = this.configService.get<string>('MAIL_FROM') || '"VCS Interview Assistant" <noreply@vcs.com>';

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
      });
      this.logger.log(`Email successfully sent to: ${to}`);
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to send email to ${to}: ${err.message}`);
      return false;
    }
  }
}
