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
    const prefix = key.includes(':') ? key.split(':')[0] : key;
    return this.configs.get(key) ?? this.configs.get(prefix) ?? {
      ttls: [60_000, 120_000, 180_000],
      maxAttempts: 5,
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

  private getLockoutDuration(count: number, maxAttempts: number): number {
    if (count < maxAttempts) return 0;
    const level = Math.min(count - maxAttempts + 1, 2); // 5th attempt -> 1 min (60s), 6th attempt and beyond -> max 2 min (120s)
    return level * 60_000;
  }

  /**
   * Check if a request is allowed. Returns { allowed: true } if OK, or { allowed: false, waitMs: number } if blocked.
   * @param key Unique identifier (e.g., IP address, user email, or combined key)
   */
  check(key: string): { allowed: boolean; waitMs: number; attemptCount: number } {
    const cfg = this.getConfig(key);
    const record = this.store.get(key);

    if (!record || record.count < cfg.maxAttempts) {
      return { allowed: true, waitMs: 0, attemptCount: record?.count ?? 0 };
    }

    const lockoutMs = this.getLockoutDuration(record.count, cfg.maxAttempts);
    const elapsed = Date.now() - record.lastAttempt;

    if (elapsed >= lockoutMs) {
      this.store.delete(key);
      return { allowed: true, waitMs: 0, attemptCount: 0 };
    }

    return {
      allowed: false,
      waitMs: lockoutMs - elapsed,
      attemptCount: record.count,
    };
  }

  /**
   * Record a failed attempt.
   */
  recordFailed(key: string): { attemptCount: number; isLocked: boolean; waitMs: number } {
    const cfg = this.getConfig(key);
    const record = this.store.get(key) ?? { count: 0, lastAttempt: 0 };

    record.count++;
    record.lastAttempt = Date.now();
    this.store.set(key, record);

    const isLocked = record.count >= cfg.maxAttempts;
    const waitMs = isLocked ? this.getLockoutDuration(record.count, cfg.maxAttempts) : 0;

    return {
      attemptCount: record.count,
      isLocked,
      waitMs,
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

    if (!record || record.count < cfg.maxAttempts) {
      return { attemptCount: record?.count ?? 0, isLocked: false, waitMs: 0 };
    }

    const lockoutMs = this.getLockoutDuration(record.count, cfg.maxAttempts);
    const elapsed = Date.now() - record.lastAttempt;
    const waitMs = elapsed >= lockoutMs ? 0 : lockoutMs - elapsed;

    return {
      attemptCount: record.count,
      isLocked: waitMs > 0,
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
