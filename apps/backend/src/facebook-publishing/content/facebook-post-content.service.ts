import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobPostingEntity } from '../../job-postings/entities/job-posting.entity';

@Injectable()
export class FacebookPostContentService {
  constructor(private readonly configService: ConfigService) {}

  build(posting: JobPostingEntity) {
    const snapshot = this.asRecord(posting.jobDescriptionVersion?.snapshot);
    const jobDescription = this.asRecord(snapshot?.jobDescription);
    const position = this.asRecord(snapshot?.position);
    const level = this.asRecord(snapshot?.level);
    let rawTitle = posting.title || this.asText(jobDescription?.title) || 'Vi tri tuyen dung';
    rawTitle = rawTitle.trim().replace(/^(tuyển dụng|tuyển)\s+/i, '');
    const title = rawTitle.toUpperCase();
    const applyUrl = this.buildApplyUrl(posting.publicSlug);
    const fanpageName = this.configService.get<string>('FACEBOOK_DEFAULT_FANPAGE_NAME') || 'VCS Careers';
    const defaultLocation = 'Tòa Keangnam Landmark 72, Đ. Phạm Hùng, Q. Nam Từ Liêm, Hà Nội';

    const lines = [
      `🚀 [HN] VIETTEL CYBER SECURITY (VCS) TUYỂN DỤNG ${title}`,
      'Bạn có kinh nghiệm và mong muốn tham gia các dự án quy mô lớn, môi trường công nghệ chuyên sâu?',
      'Cơ hội dành cho bạn tại Viettel Cyber Security (VCS)!',
      '',
      '📌 Vị trí tuyển dụng:',
      `🔹 ${rawTitle}${level?.displayName || level?.name ? ` – ${this.asText(level.displayName ?? level.name)}` : ''}`,
      '',
      this.section('💼 Mô tả công việc', this.asText(jobDescription?.description)),
      this.section('🎯 Yêu cầu', this.formatStructured(jobDescription?.requirements)),
      this.section('✨ Quyền lợi', this.formatStructured(jobDescription?.benefits)),
      `📍 Địa điểm làm việc: ${defaultLocation}`,
      '',
      `Ung vien quan tam vui long nhan tin Fanpage ${fanpageName} hoac truy cap link ung tuyen: ${applyUrl}`,
    ];

    return lines
      .flatMap((line) => (Array.isArray(line) ? line : [line]))
      .filter((line): line is string => line !== null && line !== undefined)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private section(title: string, content: string | null) {
    if (!content) return null;
    return [`${title}:`, content, ''];
  }

  private buildApplyUrl(publicSlug: string) {
    const base = this.configService.get<string>('FACEBOOK_CANDIDATE_CTA_URL_BASE') || '/jobs';
    return `${base.replace(/\/+$/, '')}/${publicSlug}`;
  }

  private formatStructured(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value === 'string') return value.trim() || null;
    if (Array.isArray(value)) {
      const items = value.map((item) => this.asText(item)).filter(Boolean);
      return items.length ? items.map((item) => `- ${item}`).join('\n') : null;
    }

    const record = this.asRecord(value);
    if (!record) return this.asText(value);
    if (typeof record.rawText === 'string') return record.rawText.trim() || null;
    if (typeof record.text === 'string') return record.text.trim() || null;

    const lines = Object.entries(record)
      .map(([key, item]) => {
        const text = this.formatStructured(item);
        return text ? `${this.humanizeKey(key)}: ${text}` : null;
      })
      .filter((line): line is string => Boolean(line));

    return lines.length ? lines.join('\n') : null;
  }

  private humanizeKey(key: string) {
    return key.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }

  private asText(value: unknown) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
  }
}
