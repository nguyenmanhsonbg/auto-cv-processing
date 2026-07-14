import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VcsPortalFetchResult, VcsPortalRawJobDescription } from './vcs-portal.types';

@Injectable()
export class VcsPortalClientService {
  private readonly perPage = 100;

  constructor(private readonly configService: ConfigService) {}

  async fetchAllJobDescriptions(): Promise<VcsPortalFetchResult> {
    const baseUrl = this.requireConfig('VCS_PORTAL_BASE_URL');
    const apiKey = this.requireConfig('VCS_PORTAL_API_KEY');
    const timeoutMs = this.getPositiveNumberConfig('VCS_PORTAL_SYNC_TIMEOUT_MS', 30_000);
    const maxPages = this.getPositiveNumberConfig('VCS_PORTAL_MAX_PAGES', 100);
    const items: VcsPortalRawJobDescription[] = [];
    let page = 1;
    let pagesFetched = 0;

    while (page <= maxPages) {
      const response = await this.fetchPage(baseUrl, apiKey, page, timeoutMs);
      const pageItems = this.extractItems(response.body, page);
      items.push(...pageItems);
      pagesFetched += 1;

      const totalPages = this.parsePositiveInteger(response.totalPagesHeader);
      if (totalPages && page >= totalPages) break;
      if (pageItems.length < this.perPage) break;
      page += 1;
    }

    if (page > maxPages) {
      throw new BadRequestException({
        code: 'VCS_PORTAL_MAX_PAGES_EXCEEDED',
        message: 'VCS Portal sync exceeded the configured maximum page count.',
        details: { maxPages },
      });
    }

    return {
      items,
      fetchedCount: items.length,
      pagesFetched,
    };
  }

  private async fetchPage(
    baseUrl: string,
    apiKey: string,
    page: number,
    timeoutMs: number,
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = this.buildPageUrl(baseUrl, page);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-VCS-API-Key': apiKey,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BadRequestException({
          code: 'VCS_PORTAL_FETCH_FAILED',
          message: 'VCS Portal returned an unsuccessful response.',
          details: {
            page,
            status: response.status,
            statusText: response.statusText,
          },
        });
      }

      return {
        body: await response.json() as unknown,
        totalPagesHeader: response.headers.get('x-wp-totalpages'),
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const isAbort = error instanceof Error && error.name === 'AbortError';
      throw new BadRequestException({
        code: isAbort ? 'VCS_PORTAL_FETCH_TIMEOUT' : 'VCS_PORTAL_FETCH_ERROR',
        message: isAbort
          ? 'VCS Portal request timed out.'
          : 'Unable to fetch VCS Portal job descriptions.',
        details: { page },
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildPageUrl(baseUrl: string, page: number) {
    const url = new URL('/wp-json/vcs-portal/v1/jds', baseUrl);
    url.searchParams.set('include_detail', 'true');
    url.searchParams.set('include_questions', 'true');
    url.searchParams.set('per_page', String(this.perPage));
    url.searchParams.set('page', String(page));
    return url;
  }

  private extractItems(body: unknown, page: number): VcsPortalRawJobDescription[] {
    if (Array.isArray(body)) return body.filter(this.isRecord);

    if (this.isRecord(body)) {
      const candidates = [body.data, body.items, body.results];
      const arrayValue = candidates.find(Array.isArray);
      if (Array.isArray(arrayValue)) return arrayValue.filter(this.isRecord);
    }

    throw new BadRequestException({
      code: 'VCS_PORTAL_RESPONSE_INVALID',
      message: 'VCS Portal response must be an array or contain an array data field.',
      details: { page },
    });
  }

  private requireConfig(name: string) {
    const value = this.configService.get<string>(name)?.trim();
    if (!value) {
      throw new BadRequestException({
        code: 'VCS_PORTAL_CONFIG_MISSING',
        message: `${name} is required before syncing VCS Portal job descriptions.`,
      });
    }
    return value;
  }

  private getPositiveNumberConfig(name: string, fallback: number) {
    const raw = this.configService.get<string>(name);
    const value = raw ? Number(raw) : fallback;
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private parsePositiveInteger(value: string | null) {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private isRecord(value: unknown): value is VcsPortalRawJobDescription {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
