import { BadRequestException, Injectable } from '@nestjs/common';
import { QuestionType } from '@interview-assistant/shared';
import { sha256Hex } from './utils';
import { stableStringify } from './utils/stable-json.util';
import {
  VcsPortalAcfFields,
  VcsPortalMappedJobDescription,
  VcsPortalMappedQuestion,
  VcsPortalMappedSourceCategory,
  VcsPortalMappedWarning,
  VcsPortalRawJobDescription,
} from './vcs-portal.types';

const BENEFIT_FIELD_NAMES = ['insurance', 'awards', 'office', 'celebration'] as const;

@Injectable()
export class VcsPortalJdMapper {
  map(raw: VcsPortalRawJobDescription): VcsPortalMappedJobDescription {
    const warnings: VcsPortalMappedWarning[] = [];
    const sourceJobId = this.requireSourceJobId(raw.id);
    const acf = this.getAcf(raw.acf);
    const title = this.requireText(this.plainText(raw.title), 'title');
    const sourcePayload = this.toJsonRecord(raw);

    const content = this.plainText(raw.content);
    const excerpt = this.plainText(raw.excerpt);
    const overview = this.plainText(acf.overview);
    const responsibilities = this.plainText(acf.responsibilities);
    const requirements = this.plainText(acf.qualifications) ?? '';
    const salary = this.plainText(acf.salary);
    const annualLeaveDays = this.plainText(acf.annual_leave_days);
    const department = this.plainText(acf.department);
    const applicationDeadline = this.parsePortalDeadline(acf.end_date, warnings);
    const benefits = this.mapBenefits(acf);
    const description = responsibilities ?? overview ?? content ?? title;
    const summary = this.toSummary([
      excerpt,
      overview,
      responsibilities,
      content,
      description,
      title,
    ]);
    const categories = this.mapCategories(raw.categories, warnings);
    const questions = this.mapQuestions(raw.questions);
    const sourceCreatedAt = this.parseSourceDate(raw.date, 'date', warnings);
    const sourceModifiedAt = this.parseSourceDate(raw.modified, 'modified', warnings);
    const sourceContentHash = sha256Hex(stableStringify({
      title,
      overview,
      responsibilities,
      requirements,
      benefits,
      salary,
      annualLeaveDays,
      department,
      applicationDeadline,
      categories,
      questions: questions.map((question) => ({
        text: question.text,
        type: question.type,
        required: question.required,
        placeholder: question.placeholder,
      })),
    }));

    return {
      sourceJobId,
      title,
      sourceSlug: this.plainText(raw.slug),
      sourceUrl: this.plainText(raw.url),
      sourceCreatedAt,
      sourceModifiedAt,
      description,
      overview,
      responsibilities,
      summary,
      requirements,
      benefits,
      salary,
      annualLeaveDays,
      department,
      applicationDeadline,
      sourcePayload,
      sourceContentHash,
      categories,
      questions,
      warnings,
    };
  }

  private mapBenefits(acf: VcsPortalAcfFields) {
    const benefits = BENEFIT_FIELD_NAMES.reduce<Record<string, string | null>>((accumulator, key) => {
      accumulator[key] = this.plainText(acf[key]);
      return accumulator;
    }, {});

    return Object.values(benefits).some((value) => Boolean(value)) ? benefits : null;
  }

  private mapQuestions(value: unknown): VcsPortalMappedQuestion[] {
    if (value == null) return [];
    if (!Array.isArray(value)) {
      throw new BadRequestException({
        code: 'VCS_PORTAL_ITEM_INVALID',
        message: 'questions must be an array.',
      });
    }

    return value.map((question, index) => {
      if (typeof question === 'string') {
        return {
          text: this.requireText(question, `questions[${index}]`),
          type: QuestionType.OPEN_ENDED,
          required: true,
          placeholder: null,
          rawSnapshot: question,
        };
      }

      if (!this.isRecord(question)) {
        throw new BadRequestException({
          code: 'VCS_PORTAL_ITEM_INVALID',
          message: `questions[${index}] must be an object or text.`,
        });
      }

      const text = this.requireText(
        this.firstPlainText([
          question.text,
          question.question,
          question.label,
          question.title,
        ]),
        `questions[${index}].text`,
      );
      const type = this.plainText(question.type) ?? QuestionType.OPEN_ENDED;
      const required = typeof question.required === 'boolean'
        ? question.required
        : this.parseBoolean(question.required) ?? true;

      return {
        text,
        type,
        required,
        placeholder: this.plainText(question.placeholder),
        rawSnapshot: this.toJsonRecord(question),
      };
    });
  }

  private mapCategories(value: unknown, warnings: VcsPortalMappedWarning[]): VcsPortalMappedSourceCategory[] {
    if (value == null) return [];
    if (!Array.isArray(value)) {
      warnings.push({
        code: 'VCS_PORTAL_CATEGORIES_INVALID',
        message: 'categories must be an array.',
      });
      return [];
    }

    const categories = value
      .map((item) => this.mapCategory(item))
      .filter((item): item is VcsPortalMappedSourceCategory => Boolean(item));
    const uniqueByIdentity = new Map<string, VcsPortalMappedSourceCategory>();

    for (const category of categories) {
      uniqueByIdentity.set(category.sourceCategoryId ?? category.slug, category);
    }

    return [...uniqueByIdentity.values()].sort((left, right) =>
      (left.sourceCategoryId ?? left.slug).localeCompare(right.sourceCategoryId ?? right.slug),
    );
  }

  private mapCategory(value: unknown): VcsPortalMappedSourceCategory | null {
    if (typeof value === 'string' || typeof value === 'number') {
      const name = String(value).trim();
      return name
        ? {
            sourceCategoryId: null,
            name,
            displayName: name,
            slug: this.slugify(name),
          }
        : null;
    }

    if (!this.isRecord(value)) return null;

    const name = this.firstPlainText([value.name, value.displayName, value.title, value.slug]);
    if (!name) return null;
    const sourceCategoryId = this.optionalId(value.id);
    const slug = this.plainText(value.slug) ?? this.slugify(name);

    return {
      sourceCategoryId,
      name,
      displayName: name,
      slug,
    };
  }

  private parsePortalDeadline(value: unknown, warnings: VcsPortalMappedWarning[]) {
    const text = this.plainText(value);
    if (!text) return null;

    const matched = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!matched) {
      warnings.push({
        code: 'VCS_PORTAL_DEADLINE_INVALID',
        message: 'acf.end_date must use dd/MM/yyyy format.',
      });
      return null;
    }

    const day = Number(matched[1]);
    const month = Number(matched[2]);
    const year = Number(matched[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year
      || date.getUTCMonth() !== month - 1
      || date.getUTCDate() !== day
    ) {
      warnings.push({
        code: 'VCS_PORTAL_DEADLINE_INVALID',
        message: 'acf.end_date is not a valid calendar date.',
      });
      return null;
    }

    return date.toISOString().slice(0, 10);
  }

  private parseSourceDate(value: unknown, fieldName: string, warnings: VcsPortalMappedWarning[]) {
    const text = this.plainText(value);
    if (!text) return null;

    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) return date;

    warnings.push({
      code: 'VCS_PORTAL_SOURCE_DATE_INVALID',
      message: `${fieldName} could not be parsed as a source timestamp.`,
    });
    return null;
  }

  private toSummary(values: Array<string | null>) {
    const value = values.find((item) => Boolean(item?.trim()))?.trim();
    if (!value) {
      throw new BadRequestException({
        code: 'VCS_PORTAL_ITEM_INVALID',
        message: 'summary cannot be derived from the VCS Portal item.',
      });
    }

    return value.length > 500 ? value.slice(0, 500).trim() : value;
  }

  private getAcf(value: unknown): VcsPortalAcfFields {
    return this.isRecord(value) ? value : {};
  }

  private firstPlainText(values: unknown[]) {
    for (const value of values) {
      const text = this.plainText(value);
      if (text) return text;
    }
    return null;
  }

  private plainText(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value !== 'string' && !this.isRecord(value)) return null;

    const rendered = typeof value === 'string'
      ? value
      : this.firstPlainText([
          value.rendered,
          value.raw,
          value.plain,
          value.text,
        ]);
    if (!rendered) return null;

    return this.htmlToPlainText(rendered);
  }

  private htmlToPlainText(value: string) {
    let result = '';
    let index = 0;
    const lowerValue = value.toLowerCase();

    while (index < value.length) {
      const current = value[index];

      if (current !== '<') {
        result += current;
        index += 1;
        continue;
      }

      const closeIndex = value.indexOf('>', index + 1);
      if (closeIndex === -1) {
        result += current;
        index += 1;
        continue;
      }

      const tagContent = value.slice(index + 1, closeIndex).trim();
      const normalizedTag = tagContent.replace(/^\//, '').split(/\s+/)[0]?.toLowerCase() ?? '';
      if (normalizedTag === 'script' || normalizedTag === 'style') {
        const closingTag = `</${normalizedTag}>`;
        const closingIndex = lowerValue.indexOf(closingTag, closeIndex + 1);
        index = closingIndex === -1 ? closeIndex + 1 : closingIndex + closingTag.length;
        continue;
      }

      if (
        tagContent.startsWith('/')
        && ['p', 'div', 'li', 'ul', 'ol', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(normalizedTag)
      ) {
        result += '\n';
      } else if (normalizedTag === 'br') {
        result += '\n';
      }

      index = closeIndex + 1;
    }

    return this.decodeHtmlEntities(result)
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() || null;
  }

  private decodeHtmlEntities(value: string) {
    return value
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&#(\d+);/g, (_match, code: string) => {
        const parsed = Number(code);
        return Number.isFinite(parsed) ? String.fromCharCode(parsed) : '';
      });
  }

  private requireSourceJobId(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'string' && value.trim()) return value.trim();

    throw new BadRequestException({
      code: 'VCS_PORTAL_ITEM_INVALID',
      message: 'id is required for every VCS Portal job description.',
    });
  }

  private requireText(value: string | null, fieldName: string) {
    const normalized = value?.trim();
    if (!normalized) {
      throw new BadRequestException({
        code: 'VCS_PORTAL_ITEM_INVALID',
        message: `${fieldName} is required.`,
      });
    }
    return normalized;
  }

  private optionalId(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'string' && value.trim()) return value.trim();
    return null;
  }

  private parseBoolean(value: unknown) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : null;
    if (typeof value !== 'string') return null;

    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'required'].includes(normalized)) return true;
    if (['false', '0', 'no', 'optional'].includes(normalized)) return false;
    return null;
  }

  private toJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(stableStringify(value)) as Record<string, unknown>;
  }

  private slugify(value: string) {
    return this.removeVietnameseMarks(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'uncategorized';
  }

  private removeVietnameseMarks(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
