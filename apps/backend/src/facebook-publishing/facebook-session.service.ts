import { BadRequestException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';

interface PlaywrightStorageState extends Record<string, unknown> {
  cookies: unknown[];
  origins: unknown[];
}

@Injectable()
export class FacebookSessionService implements OnModuleDestroy {
  private loginContext: BrowserContext | null = null;
  private loginPage: Page | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleDestroy() {
    await this.closeLoginContext();
  }

  getSessionPath() {
    return resolve(
      this.configService.get<string>('FACEBOOK_RPA_SESSION_PATH')
        ?? './storage/facebook-rpa/storage-state.json',
    );
  }

  async getStatus() {
    const sessionPath = this.getSessionPath();
    if (!existsSync(sessionPath)) {
      return {
        ready: false,
        sessionPath,
        message: 'Facebook RPA session is not ready. Please login Facebook first.',
      };
    }

    try {
      const raw = await readFile(sessionPath, 'utf8');
      const storageState = JSON.parse(raw) as PlaywrightStorageState;
      const cookies = Array.isArray(storageState.cookies) ? storageState.cookies : [];
      const origins = Array.isArray(storageState.origins) ? storageState.origins : [];
      const facebookCookieCount = cookies.filter((cookie) => {
        if (typeof cookie !== 'object' || cookie === null) return false;
        const domain = (cookie as { domain?: unknown }).domain;
        return typeof domain === 'string' && domain.includes('facebook.com');
      }).length;
      const ready = cookies.length > 0 && facebookCookieCount > 0 && origins.length >= 0;

      return {
        ready,
        sessionPath,
        cookieCount: cookies.length,
        facebookCookieCount,
        originCount: origins.length,
        message: ready
          ? 'Facebook RPA session is ready.'
          : 'Facebook RPA session file is present but no Facebook login cookie was found.',
      };
    } catch {
      return {
        ready: false,
        sessionPath,
        message: 'Facebook RPA session file cannot be read.',
      };
    }
  }

  async importStorageState(sessionOwnerKey: string | undefined, storageState: Record<string, unknown>) {
    this.assertStorageState(storageState);
    const sessionPath = this.getSessionPath();
    await mkdir(dirname(sessionPath), { recursive: true });
    await writeFile(
      sessionPath,
      JSON.stringify(
        {
          ...storageState,
          metadata: {
            sessionOwnerKey: sessionOwnerKey ?? null,
            importedAt: new Date().toISOString(),
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    return this.getStatus();
  }

  async startLogin() {
    const sessionPath = this.getSessionPath();
    await mkdir(dirname(sessionPath), { recursive: true });

    try {
      const page = await this.getOrCreateLoginPage();
      await page.bringToFront();
      if (!page.url().includes('facebook.com')) {
        await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' });
      }

      return {
        ready: false,
        loginUrl: 'https://www.facebook.com/login',
        loginCompleteUrl: '/api/integrations/facebook/session/login/complete',
        importUrl: '/api/integrations/facebook/session/import',
        sessionPath,
        browserLaunched: true,
        message: 'A real browser was opened. Login Facebook there, then call login/complete.',
      };
    } catch (error) {
      return {
        ready: false,
        loginUrl: 'https://www.facebook.com/login',
        loginCompleteUrl: '/api/integrations/facebook/session/login/complete',
        importUrl: '/api/integrations/facebook/session/import',
        sessionPath,
        browserLaunched: false,
        message: error instanceof Error
          ? `Could not open Playwright browser: ${error.message}`
          : 'Could not open Playwright browser.',
      };
    }
  }

  async completeLogin() {
    if (this.loginContext) {
      const sessionPath = this.getSessionPath();
      await mkdir(dirname(sessionPath), { recursive: true });
      await this.loginContext.storageState({ path: sessionPath });
      await this.closeLoginContext();
    }

    const status = await this.getStatus();
    return {
      ...status,
      message: status.ready
        ? 'Facebook RPA session is ready.'
        : 'Facebook RPA session is not ready. Please import storageState after login.',
    };
  }

  private assertStorageState(storageState: Record<string, unknown>): asserts storageState is PlaywrightStorageState {
    if (!Array.isArray(storageState.cookies) || !Array.isArray(storageState.origins)) {
      throw new BadRequestException('storageState.cookies and storageState.origins must be arrays');
    }
  }

  private async getOrCreateLoginPage() {
    if (this.loginContext && this.loginPage && !this.loginPage.isClosed()) {
      return this.loginPage;
    }

    await this.closeLoginContext();
    const userDataDir = resolve(
      this.configService.get<string>('FACEBOOK_RPA_USER_DATA_DIR')
        ?? './storage/facebook-rpa/user-data',
    );
    await mkdir(userDataDir, { recursive: true });

    this.loginContext = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: this.getBrowserChannel(),
      viewport: { width: 1280, height: 900 },
    });
    this.loginPage = this.loginContext.pages()[0] ?? await this.loginContext.newPage();

    return this.loginPage;
  }

  private async closeLoginContext() {
    if (!this.loginContext) return;
    try {
      await this.loginContext.close();
    } finally {
      this.loginContext = null;
      this.loginPage = null;
    }
  }

  private getBrowserChannel() {
    const channel = this.configService.get<string>('FACEBOOK_RPA_BROWSER_CHANNEL');
    return channel?.trim() || undefined;
  }
}
