import { BadRequestException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { existsSync } from 'fs';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'path';

interface PlaywrightStorageState extends Record<string, unknown> {
  cookies: unknown[];
  origins: unknown[];
}

export interface FacebookSessionStatus {
  ready: boolean;
  sessionPath: string;
  cookieCount?: number;
  facebookCookieCount?: number;
  authenticatedCookieCount?: number;
  originCount?: number;
  browserLaunched?: boolean;
  currentUrl?: string;
  message: string;
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

  getUserDataDir() {
    return resolve(
      this.configService.get<string>('FACEBOOK_RPA_USER_DATA_DIR')
        ?? './storage/facebook-rpa/user-data',
    );
  }

  async getStatus(): Promise<FacebookSessionStatus> {
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
      return this.buildStatusFromStorageState(storageState, sessionPath);
    } catch {
      return {
        ready: false,
        sessionPath,
        message: 'Facebook RPA session file cannot be read.',
      };
    }
  }

  async ensureReadyForPublish(options: { forceLogin?: boolean } = {}) {
    if (!options.forceLogin) {
      const status = await this.getStatus();
      if (status.ready) return status;
    }

    const loginStart = await this.startLogin({ force: options.forceLogin });
    if (!loginStart.browserLaunched) return loginStart;

    return this.waitForLoginCompletion();
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

  async startLogin(options: { force?: boolean } = {}) {
    const sessionPath = this.getSessionPath();
    await mkdir(dirname(sessionPath), { recursive: true });

    try {
      const page = await this.getOrCreateLoginPage();
      await page.bringToFront();
      if (options.force || !page.url().includes('facebook.com')) {
        await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' });
      }

      return {
        ready: false,
        loginUrl: 'https://www.facebook.com/login',
        loginCompleteUrl: '/api/integrations/facebook/session/login/complete',
        importUrl: '/api/integrations/facebook/session/import',
        sessionPath,
        browserLaunched: true,
        message: 'A real browser was opened. Login Facebook there. Publishing will continue after login is detected.',
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
      await this.saveLoginContextState();
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

  async resetForTesting(confirm: string) {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new BadRequestException('Facebook session test reset is disabled in production.');
    }
    if (confirm !== 'RESET_FACEBOOK_SESSION_FOR_TEST') {
      throw new BadRequestException('Invalid confirmation for Facebook session test reset.');
    }

    await this.closeLoginContext();

    const sessionPath = this.getSessionPath();
    const sessionDir = dirname(sessionPath);
    const userDataDir = this.getUserDataDir();
    this.assertResetTargetInsideSessionDir(sessionPath, sessionDir);
    this.assertResetTargetInsideSessionDir(userDataDir, sessionDir);

    const removed = {
      storageState: existsSync(sessionPath),
      userDataDir: existsSync(userDataDir),
    };

    await rm(sessionPath, { force: true });
    await rm(userDataDir, { recursive: true, force: true });

    return {
      ready: false,
      sessionPath,
      userDataDir,
      removed,
      message: 'Facebook RPA session was reset for testing only. The next Facebook publish will open a login browser.',
    };
  }

  private async waitForLoginCompletion(): Promise<FacebookSessionStatus> {
    const timeoutMs = this.numberEnv('FACEBOOK_LOGIN_WAIT_TIMEOUT_MS', 10 * 60_000);
    const intervalMs = this.numberEnv('FACEBOOK_LOGIN_WAIT_INTERVAL_MS', 2_000);
    const deadline = Date.now() + timeoutMs;
    const sessionPath = this.getSessionPath();

    while (Date.now() < deadline) {
      const status = await this.getLiveLoginStatus(sessionPath);
      if (status.ready) {
        await this.saveLoginContextState();
        await this.closeLoginContext();
        return {
          ...await this.getStatus(),
          message: 'Facebook RPA session is ready. Publishing will continue automatically.',
        };
      }

      await this.sleep(intervalMs);
    }

    return {
      ready: false,
      sessionPath,
      browserLaunched: true,
      message: 'Facebook login timed out. Please complete Facebook login and try publishing again.',
    };
  }

  private async getLiveLoginStatus(sessionPath: string): Promise<FacebookSessionStatus> {
    if (!this.loginContext) return this.getStatus();

    const storageState = await this.loginContext.storageState();
    const status = this.buildStatusFromStorageState(storageState, sessionPath);
    const currentUrl = this.loginPage && !this.loginPage.isClosed()
      ? this.loginPage.url()
      : '';
    const loggedInPage = this.isLoggedInFacebookPage(currentUrl);
    const ready = status.ready && loggedInPage;

    return {
      ...status,
      ready,
      currentUrl,
      browserLaunched: true,
      message: ready
        ? 'Facebook login detected.'
        : 'Waiting for Facebook login to complete.',
    };
  }

  private buildStatusFromStorageState(
    storageState: PlaywrightStorageState,
    sessionPath: string,
  ): FacebookSessionStatus {
    const cookies = Array.isArray(storageState.cookies) ? storageState.cookies : [];
    const origins = Array.isArray(storageState.origins) ? storageState.origins : [];
    const facebookCookieCount = cookies.filter((cookie) => this.isFacebookCookie(cookie)).length;
    const authenticatedCookieCount = cookies.filter((cookie) => this.isAuthenticatedFacebookCookie(cookie)).length;
    const ready = facebookCookieCount > 0 && authenticatedCookieCount > 0;

    return {
      ready,
      sessionPath,
      cookieCount: cookies.length,
      facebookCookieCount,
      authenticatedCookieCount,
      originCount: origins.length,
      message: ready
        ? 'Facebook RPA session is ready.'
        : 'Facebook RPA session file is present but no authenticated Facebook login cookie was found.',
    };
  }

  private isFacebookCookie(cookie: unknown) {
    if (typeof cookie !== 'object' || cookie === null) return false;
    const domain = (cookie as { domain?: unknown }).domain;
    return typeof domain === 'string' && domain.includes('facebook.com');
  }

  private isAuthenticatedFacebookCookie(cookie: unknown) {
    if (!this.isFacebookCookie(cookie)) return false;
    const name = (cookie as { name?: unknown }).name;
    return name === 'c_user';
  }

  private isLoggedInFacebookPage(url: string) {
    if (!url.includes('facebook.com')) return false;
    return !/\/login|checkpoint|recover|confirmemail|two_step|login_identify/i.test(url);
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
    const userDataDir = this.getUserDataDir();
    await mkdir(userDataDir, { recursive: true });

    this.loginContext = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: this.getBrowserChannel(),
      viewport: { width: 1280, height: 900 },
    });
    this.loginPage = this.loginContext.pages()[0] ?? await this.loginContext.newPage();

    return this.loginPage;
  }

  private async saveLoginContextState() {
    if (!this.loginContext) return;
    const sessionPath = this.getSessionPath();
    await mkdir(dirname(sessionPath), { recursive: true });
    await this.loginContext.storageState({ path: sessionPath });
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

  private numberEnv(name: string, defaultValue: number) {
    const raw = this.configService.get<string | number>(name);
    const value = Number(raw);
    return Number.isFinite(value) ? value : defaultValue;
  }

  private async sleep(ms: number) {
    await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
  }

  private assertResetTargetInsideSessionDir(targetPath: string, sessionDir: string) {
    const relativePath = relative(sessionDir, targetPath);
    if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new BadRequestException(
        'Facebook session test reset only supports paths inside the configured Facebook RPA session directory.',
      );
    }
  }
}
