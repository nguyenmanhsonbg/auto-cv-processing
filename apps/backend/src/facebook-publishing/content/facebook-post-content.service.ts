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
      applyUrl: '{{APPLY_URL}}',
    });
  }

  private buildContent(input: FacebookPostSnapshotInput & {
    level?: Record<string, unknown> | null;
    applyUrl: string;
  }) {
    const level = input.level;
    const rawTitle = this.stripRecruitmentPrefix(this.asText(input.title) || 'Vi tri tuyen dung');
    const title = rawTitle.toUpperCase();
    const fanpageName = this.configService.get<string>('FACEBOOK_DEFAULT_FANPAGE_NAME') || 'VCS Careers';
    const defaultLocation = 'Toa Keangnam Landmark 72, Pham Hung, Nam Tu Liem, Ha Noi';
    const location = this.asText(input.location) || defaultLocation;

    const lines = [
      `[HN] VIETTEL CYBER SECURITY (VCS) TUYEN DUNG ${title}`,
      'Ban co kinh nghiem va mong muon tham gia cac du an quy mo lon, moi truong cong nghe chuyen sau?',
      'Co hoi danh cho ban tai Viettel Cyber Security (VCS)!',
      '',
      'Vi tri tuyen dung:',
      `- ${rawTitle}${level?.displayName || level?.name ? ` - ${this.asText(level.displayName ?? level.name)}` : ''}`,
      '',
      this.section('Mo ta cong viec', this.asText(input.description)),
      this.section('Yeu cau', this.formatStructured(input.requirements)),
      this.section('Quyen loi', this.formatStructured(input.benefits)),
      `Dia diem lam viec: ${location}`,
      '',
      `Ung vien quan tam vui long nhan tin Fanpage ${fanpageName} hoac truy cap link ung tuyen: ${input.applyUrl}`,
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

  private hydrateApplyUrl(content: string, publicSlug: string) {
    const applyUrl = this.buildApplyUrl(publicSlug);
    return content
      .replace(/\{\{\s*APPLY_URL\s*\}\}/gi, applyUrl)
      .replace(/\[\s*APPLY_URL\s*\]/gi, applyUrl)
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
