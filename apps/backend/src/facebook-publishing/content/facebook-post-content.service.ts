import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobPostingEntity } from '../../job-postings/entities/job-posting.entity';

interface FacebookPostSnapshotInput {
  title?: unknown;
  description?: unknown;
  summary?: unknown;
  requirements?: unknown;
  benefits?: unknown;
  location?: unknown;
}

@Injectable()
export class FacebookPostContentService {
  constructor(private readonly configService: ConfigService) {}

  build(posting: JobPostingEntity, customContent?: string | null) {
    const normalizedCustomContent = customContent?.trim();
    if (normalizedCustomContent) {
      return this.hydrateApplyUrl(normalizedCustomContent, posting.publicSlug);
    }

    const snapshot = this.asRecord(posting.jobDescriptionVersion?.snapshot);
    const jobDescription = this.asRecord(snapshot?.jobDescription);
    const level = this.asRecord(snapshot?.level);

    return this.buildContent({
      title: posting.title || this.asText(jobDescription?.title),
      description: jobDescription?.description,
      requirements: jobDescription?.requirements,
      benefits: jobDescription?.benefits,
      level,
      applyUrl: this.buildApplyUrl(posting.publicSlug),
    });
  }

  buildFromSnapshot(snapshot: FacebookPostSnapshotInput) {
    return this.buildContent({
      title: snapshot.title,
      description: snapshot.description ?? snapshot.summary,
      requirements: snapshot.requirements,
      benefits: snapshot.benefits,
      location: snapshot.location,
      applyUrl: '{{APPLY_URL}}',
    });
  }

  private buildContent(input: FacebookPostSnapshotInput & {
    level?: Record<string, unknown> | null;
    applyUrl: string;
  }) {
    const level = input.level;
    const rawTitle = this.stripRecruitmentPrefix(this.asText(input.title) || 'Vị trí tuyển dụng');
    const title = rawTitle.toUpperCase();
    const fanpageName = this.configService.get<string>('FACEBOOK_DEFAULT_FANPAGE_NAME') || 'VCS Careers';
    const defaultLocation = 'Tòa Keangnam Landmark 72, Phạm Hùng, Nam Từ Liêm, Hà Nội';
    const location = this.asText(input.location) || defaultLocation;

    const lines = [
      `[HN] VIETTEL CYBER SECURITY (VCS) TUYỂN DỤNG ${title}`,
      'Bạn có kinh nghiệm và mong muốn tham gia các dự án quy mô lớn, môi trường công nghệ chuyên sâu?',
      'Cơ hội dành cho bạn tại Viettel Cyber Security (VCS)!',
      '',
      'Vị trí tuyển dụng:',
      `- ${rawTitle}${level?.displayName || level?.name ? ` - ${this.asText(level.displayName ?? level.name)}` : ''}`,
      '',
      this.section(' Mô tả công việc', this.asText(input.description)),
      this.section('Yêu cầu', this.formatStructured(input.requirements)),
      this.section('Quyền lợi', this.formatStructured(input.benefits)),
      `Địa điểm làm việc: ${location}`,
      '',
      `Ứng viên quan tâm vui lòng nhắn tin Fanpage ${fanpageName} hoặc truy cập link ứng tuyển: ${input.applyUrl}`,
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
    let normalizedBase = base;
    while (normalizedBase.endsWith('/')) normalizedBase = normalizedBase.slice(0, -1);
    return `${normalizedBase}/${publicSlug}`;
  }

  private hydrateApplyUrl(content: string, publicSlug: string) {
    const applyUrl = this.buildApplyUrl(publicSlug);
    return content
      .replace(/\{\{\s*APPLY_URL\s*\}\}/gi, applyUrl)
      .replace(/\[\s*(?:APPLY_URL|Inbox\/Zalo\/Email\s+ứng\s+tuyển)\s*\]/giu, applyUrl)
      .trim();
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

  private stripRecruitmentPrefix(value: string) {
    return value
      .trim()
      .replace(/^(tuyen dung|tuyen)\s+/i, '')
      .trim();
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
