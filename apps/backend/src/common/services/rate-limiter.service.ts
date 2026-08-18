import { Injectable } from '@nestjs/common';

export interface RateLimiterConfig {
  /** Time windows in ms (progressive). Default: [60000, 120000, 180000] */
  ttls?: number[];
  /** Max failed attempts before lockout. Default: 3 */
  maxAttempts?: number;
  /** After maxAttempts, lock for this duration (ms). Default: last ttl * 2 */
  lockoutMultiplier?: number;
}

interface AttemptRecord {
  count: number;
  lastAttempt: number;
}

@Injectable()
export class RateLimiterService {
  private readonly store = new Map<string, AttemptRecord>();
  private readonly configs = new Map<string, Required<RateLimiterConfig>>();

  private getConfig(key: string): Required<RateLimiterConfig> {
    return this.configs.get(key) ?? {
      ttls: [60_000, 120_000, 180_000],
      maxAttempts: 3,
      lockoutMultiplier: 2,
    };
  }

  /**
   * Configure rate limit for a specific key (e.g., endpoint name, route, or identifier type).
   */
  configure(key: string, config: RateLimiterConfig): void {
    this.configs.set(key, {
      ttls: config.ttls ?? [60_000, 120_000, 180_000],
      maxAttempts: config.maxAttempts ?? 3,
      lockoutMultiplier: config.lockoutMultiplier ?? 2,
    });
  }

  /**
   * Check if a request is allowed. Returns { allowed: true } if OK, or { allowed: false, waitMs: number } if blocked.
   * @param key Unique identifier (e.g., IP address, user email, or combined key)
   */
  check(key: string): { allowed: boolean; waitMs: number; attemptCount: number } {
    const cfg = this.getConfig(key);
    const record = this.store.get(key);

    if (!record) {
      return { allowed: true, waitMs: 0, attemptCount: 0 };
    }

    const ttlIndex = Math.min(record.count, cfg.ttls.length - 1);
    const ttl = cfg.ttls[ttlIndex];
    const elapsed = Date.now() - record.lastAttempt;

    if (elapsed >= ttl) {
      this.store.delete(key);
      return { allowed: true, waitMs: 0, attemptCount: 0 };
    }

    return {
      allowed: false,
      waitMs: ttl - elapsed,
      attemptCount: record.count,
    };
  }

  /**
   * Record a failed attempt.
   */
  recordFailed(key: string): { attemptCount: number; isLocked: boolean } {
    const cfg = this.getConfig(key);
    const record = this.store.get(key) ?? { count: 0, lastAttempt: 0 };

    record.count++;
    record.lastAttempt = Date.now();
    this.store.set(key, record);

    return {
      attemptCount: record.count,
      isLocked: record.count >= cfg.maxAttempts,
    };
  }

  /**
   * Record a successful attempt (clears record).
   */
  recordSuccess(key: string): void {
    this.store.delete(key);
  }

  /**
   * Get current status without modifying state.
   */
  getStatus(key: string): { attemptCount: number; isLocked: boolean; waitMs: number } {
    const cfg = this.getConfig(key);
    const record = this.store.get(key);

    if (!record) {
      return { attemptCount: 0, isLocked: false, waitMs: 0 };
    }

    const ttlIndex = Math.min(record.count, cfg.ttls.length - 1);
    const ttl = cfg.ttls[ttlIndex];
    const elapsed = Date.now() - record.lastAttempt;
    const waitMs = elapsed >= ttl ? 0 : ttl - elapsed;

    return {
      attemptCount: record.count,
      isLocked: record.count >= cfg.maxAttempts,
      waitMs,
    };
  }

  /**
   * Clear rate limit for a key (admin use).
   */
  clear(key: string): void {
    this.store.delete(key);
  }
}
