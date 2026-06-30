import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir } from 'fs/promises';
import { resolve } from 'path';
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import {
  FacebookPublishResultStatus,
  ResolvedFacebookPublishTarget,
} from '../facebook-publishing.types';
import { FacebookSessionService } from '../facebook-session.service';

interface RpaInvokeResponse {
  success?: boolean;
  status?: string;
  message?: string;
  errorReason?: string;
  externalPostId?: string;
  submitted?: boolean;
}

type FacebookSurface = 'group' | 'page';

@Injectable()
export class FacebookGroupRpaClient {
  constructor(
    private readonly configService: ConfigService,
    private readonly sessionService: FacebookSessionService,
  ) {}

  async publishToGroup(target: ResolvedFacebookPublishTarget, content: string) {
    return this.publishWithRpa(target, content, 'group');
  }

  async publishToFanpage(target: ResolvedFacebookPublishTarget, content: string) {
    return this.publishWithRpa(target, content, 'page');
  }

  private async publishWithRpa(
    target: ResolvedFacebookPublishTarget,
    content: string,
    surface: FacebookSurface,
  ) {
    const sessionStatus = await this.sessionService.getStatus();
    if (!sessionStatus.ready) {
      return {
        status: FacebookPublishResultStatus.FAILED,
        message: 'Facebook RPA session is not ready. Please login Facebook first.',
      };
    }

    const targetUrl = target.targetUrl ?? this.resolvePageUrl(target, surface);
    if (!targetUrl) {
      return {
        status: FacebookPublishResultStatus.FAILED,
        message: surface === 'group'
          ? 'Facebook group URL is required.'
          : 'Facebook fanpage URL or pageId is required for RPA fallback.',
      };
    }

    const baseUrl = this.configService.get<string>('FACEBOOK_RPA_BASE_URL')?.trim();
    if (!baseUrl) {
      return this.publishViaPlaywright(target, targetUrl, content, surface, sessionStatus.sessionPath);
    }

    const timeoutMs = this.numberEnv('FACEBOOK_RPA_TIMEOUT_MS', 120_000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const tool = surface === 'group' ? 'facebookGroupPost' : 'facebookPagePost';

    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/tools/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          tool,
          arguments: {
            groupUrl: surface === 'group' ? targetUrl : undefined,
            pageUrl: surface === 'page' ? targetUrl : undefined,
            content,
            storageStatePath: sessionStatus.sessionPath,
          },
        }),
      });

      const body = await this.parseResponse(response);
      if (!response.ok || body.success === false || body.status === 'FAILED') {
        return {
          status: FacebookPublishResultStatus.FAILED,
          message: body.errorReason || body.message || 'Facebook group RPA publish failed.',
        };
      }

      return {
        status: FacebookPublishResultStatus.SUCCESS,
        message: body.message || 'Submitted to Facebook group',
        externalPostId: body.externalPostId ?? null,
      };
    } catch (error) {
      return {
        status: FacebookPublishResultStatus.FAILED,
        message: error instanceof Error && error.name === 'AbortError'
          ? 'Facebook group RPA request timed out.'
          : 'Facebook RPA service is not available.',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async publishViaPlaywright(
    target: ResolvedFacebookPublishTarget,
    targetUrl: string,
    content: string,
    surface: FacebookSurface,
    sessionPath: string,
  ) {
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      browser = await chromium.launch({
        headless: this.booleanEnv('FACEBOOK_RPA_HEADLESS', false),
        channel: this.browserChannel(),
        slowMo: this.numberEnv('FACEBOOK_RPA_SLOW_MO_MS', 80),
      });
      context = await browser.newContext({
        storageState: sessionPath,
        viewport: { width: 1280, height: 900 },
        locale: 'vi-VN',
      });
      page = await context.newPage();
      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.numberEnv('FACEBOOK_RPA_NAVIGATION_TIMEOUT_MS', 60_000),
      });
      await this.stepDelay(
        'FACEBOOK_RPA_AFTER_NAVIGATION_DELAY_MIN_MS',
        'FACEBOOK_RPA_AFTER_NAVIGATION_DELAY_MAX_MS',
        2_500,
        6_000,
      );

      if (/\/login|checkpoint/i.test(page.url())) {
        return {
          status: FacebookPublishResultStatus.FAILED,
          message: 'Facebook session expired or requires checkpoint. Please login Facebook again.',
        };
      }

      const permissionMessage = await this.firstVisibleText(page, [
        /content isn.?t available/i,
        /this content isn.?t available/i,
        /b\u1ea1n hi\u1ec7n kh\u00f4ng xem \u0111\u01b0\u1ee3c n\u1ed9i dung n\u00e0y/i,
        /you can.?t post/i,
        /not allowed to post/i,
        /kh[oô]ng th[eể] [dđ][aă]ng/i,
        /kh[oô]ng c[oó] quy[eề]n/i,
      ]);
      if (permissionMessage) {
        return {
          status: FacebookPublishResultStatus.FAILED,
          message: permissionMessage,
        };
      }

      await this.withRetries(() => this.openComposer(page!, surface), 'open composer');
      await this.withRetries(() => this.fillComposer(page!, content), 'fill composer');
      await this.withRetries(() => this.submitComposer(page!), 'submit post');
      await this.stepDelay(
        'FACEBOOK_RPA_AFTER_SUBMIT_SETTLE_DELAY_MIN_MS',
        'FACEBOOK_RPA_AFTER_SUBMIT_SETTLE_DELAY_MAX_MS',
        4_000,
        9_000,
      );

      const errorMessage = await this.firstVisibleText(page, [
        /something went wrong/i,
        /try again/i,
        /couldn.?t post/i,
        /kh[oô]ng th[eể] [dđ][aă]ng/i,
        /th[uư][rử] l[aạ]i/i,
      ]);
      if (errorMessage) {
        const screenshotPath = await this.captureFailure(page, target.targetName);
        return {
          status: FacebookPublishResultStatus.FAILED,
          message: `${errorMessage}. Screenshot: ${screenshotPath}`,
        };
      }

      const pendingMessage = await this.firstVisibleText(page, [
        /pending/i,
        /submitted/i,
        /waiting for approval/i,
        /ch[oờ] duy[eệ]t/i,
        /[dđ][aã] g[uử]i/i,
      ]);

      await context.storageState({ path: sessionPath });

      return {
        status: FacebookPublishResultStatus.SUCCESS,
        message: pendingMessage
          ? `${surface === 'group' ? 'Submitted to Facebook group' : 'Submitted to Facebook page'}: ${pendingMessage}`
          : surface === 'group'
            ? 'Submitted to Facebook group'
            : 'Submitted to Facebook page',
      };
    } catch (error) {
      const screenshotPath = page ? await this.captureFailure(page, target.targetName) : null;
      return {
        status: FacebookPublishResultStatus.FAILED,
        message: error instanceof Error
          ? `${surface === 'group' ? 'Facebook group' : 'Facebook page'} RPA publish failed: ${error.message}${screenshotPath ? `. Screenshot: ${screenshotPath}` : ''}`
          : `${surface === 'group' ? 'Facebook group' : 'Facebook page'} RPA publish failed.`,
      };
    } finally {
      if (context) await context.close().catch(() => undefined);
      if (browser) await browser.close().catch(() => undefined);
    }
  }

  private async openComposer(page: Page, surface: FacebookSurface) {
    const labels = surface === 'group'
      ? /write something|create a public post|what.?s on your mind|vi[eế]t g[iì]|t[aạ]o b[aà]i vi[eế]t/i
      : /what.?s on your mind|create post|vi[eế]t g[iì]|t[aạ]o b[aà]i vi[eế]t/i;

    const candidates: Locator[] = [
      page.getByRole('button', { name: labels }).first(),
      page.locator('[aria-label*="Write"], [aria-label*="Post"], [aria-label*="Viết"], [aria-label*="Đăng"]').first(),
      page.getByText(labels).first(),
    ];

    for (const candidate of candidates) {
      if (await this.tryClick(candidate)) {
        await this.stepDelay(
          'FACEBOOK_RPA_AFTER_OPEN_COMPOSER_DELAY_MIN_MS',
          'FACEBOOK_RPA_AFTER_OPEN_COMPOSER_DELAY_MAX_MS',
          2_000,
          5_000,
        );
        return;
      }
    }

    throw new Error('Could not find Facebook post composer.');
  }

  private async fillComposer(page: Page, content: string) {
    const editors: Locator[] = [
      page.locator('[contenteditable="true"][role="textbox"]').last(),
      page.getByRole('textbox').last(),
      page.locator('[contenteditable="true"]').last(),
    ];

    for (const editor of editors) {
      try {
        await editor.waitFor({ state: 'visible', timeout: 6_000 });
        await editor.click({ timeout: 4_000 });
        await this.stepDelay(
          'FACEBOOK_RPA_BEFORE_FILL_DELAY_MIN_MS',
          'FACEBOOK_RPA_BEFORE_FILL_DELAY_MAX_MS',
          1_500,
          3_500,
        );
        try {
          await editor.fill(content, { timeout: 8_000 });
        } catch {
          await page.keyboard.insertText(content);
        }
        await this.stepDelay(
          'FACEBOOK_RPA_AFTER_FILL_DELAY_MIN_MS',
          'FACEBOOK_RPA_AFTER_FILL_DELAY_MAX_MS',
          2_500,
          6_000,
        );
        return;
      } catch {
        // Try the next selector fallback.
      }
    }

    throw new Error('Could not fill Facebook post composer.');
  }

  private async submitComposer(page: Page) {
    const buttons: Locator[] = [
      page.getByRole('button', { name: /^(post|[dđ][aă]ng)$/i }).last(),
      page.locator('[aria-label="Post"], [aria-label="Đăng"]').last(),
      page.getByText(/^(post|[dđ][aă]ng)$/i).last(),
    ];

    for (const button of buttons) {
      if (await this.tryClick(button)) {
        await page.waitForTimeout(this.numberEnv('FACEBOOK_RPA_AFTER_SUBMIT_WAIT_MS', 10_000));
        return;
      }
    }

    throw new Error('Could not find enabled Facebook Post button.');
  }

  private async tryClick(locator: Locator) {
    try {
      await locator.waitFor({ state: 'visible', timeout: 5_000 });
      if (await locator.isDisabled().catch(() => false)) return false;
      await locator.click({ timeout: 5_000 });
      return true;
    } catch {
      return false;
    }
  }

  private async withRetries(action: () => Promise<void>, stepName: string) {
    const attempts = Math.max(1, this.numberEnv('FACEBOOK_RPA_RETRY_COUNT', 3));
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await action();
        return;
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await this.randomDelay();
      }
    }

    throw new Error(`${stepName} failed${lastError instanceof Error ? `: ${lastError.message}` : ''}`);
  }

  private async firstVisibleText(page: Page, patterns: RegExp[]) {
    for (const pattern of patterns) {
      const locator = page.getByText(pattern).first();
      try {
        if (await locator.isVisible({ timeout: 1_500 })) {
          return (await locator.textContent())?.trim() || pattern.source;
        }
      } catch {
        // Keep scanning fallback patterns.
      }
    }

    return null;
  }

  private async captureFailure(page: Page, targetName: string) {
    const artifactsDir = resolve(
      this.configService.get<string>('FACEBOOK_RPA_ARTIFACTS_DIR')
        ?? './storage/facebook-rpa/artifacts',
    );
    await mkdir(artifactsDir, { recursive: true });
    const safeName = targetName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'target';
    const path = resolve(artifactsDir, `${Date.now()}-${safeName}.png`);
    await page.screenshot({ path, fullPage: true }).catch(() => undefined);
    return path;
  }

  private async randomDelay(multiplier = 1) {
    await this.stepDelay(
      'FACEBOOK_RPA_DELAY_MIN_MS',
      'FACEBOOK_RPA_DELAY_MAX_MS',
      1_500,
      4_500,
      multiplier,
    );
  }

  private async stepDelay(
    minEnv: string,
    maxEnv: string,
    defaultMin: number,
    defaultMax: number,
    multiplier = 1,
  ) {
    const min = this.numberEnv(minEnv, defaultMin);
    const max = Math.max(min, this.numberEnv(maxEnv, defaultMax));
    const delay = Math.round((min + Math.random() * (max - min)) * multiplier);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
  }

  private resolvePageUrl(target: ResolvedFacebookPublishTarget, surface: FacebookSurface) {
    if (surface !== 'page') return null;
    if (target.targetExternalId) return `https://www.facebook.com/${target.targetExternalId}`;
    return null;
  }

  private browserChannel() {
    const channel = this.configService.get<string>('FACEBOOK_RPA_BROWSER_CHANNEL');
    return channel?.trim() || undefined;
  }

  private booleanEnv(name: string, defaultValue: boolean) {
    const raw = this.configService.get<string | boolean>(name);
    if (raw === undefined || raw === null || raw === '') return defaultValue;
    if (typeof raw === 'boolean') return raw;
    return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
  }

  private numberEnv(name: string, defaultValue: number) {
    const raw = this.configService.get<string | number>(name);
    const value = Number(raw);
    return Number.isFinite(value) ? value : defaultValue;
  }

  private async parseResponse(response: Response): Promise<RpaInvokeResponse> {
    const text = await response.text();
    if (!text) return {};

    try {
      return JSON.parse(text) as RpaInvokeResponse;
    } catch {
      return { message: text };
    }
  }
}
