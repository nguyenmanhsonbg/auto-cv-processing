import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RateLimiterService } from '../../common/services/rate-limiter.service';

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const mStr = mins.toString().padStart(2, '0');
  const sStr = secs.toString().padStart(2, '0');
  return `00:${mStr}:${sStr}`;
}

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  constructor(private rateLimiter: RateLimiterService) {
    super();
    this.rateLimiter.configure('login', {
      ttls: [60_000, 120_000, 180_000],
      maxAttempts: 5,
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const login = req.body?.login || req.body?.email || '';
    const key = `login:${login}`;

    if (login) {
      const check = this.rateLimiter.check(key);
      if (!check.allowed) {
        const seconds = Math.ceil(check.waitMs / 1000);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Tài khoản của bạn đã bị tạm khóa. Vui lòng thử lại sau ${formatDuration(seconds)}.`,
            waitMs: check.waitMs,
            attemptCount: check.attemptCount,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    try {
      const result = (await super.canActivate(context)) as boolean;
      if (login) {
        this.rateLimiter.recordSuccess(key);
      }
      return result;
    } catch (err) {
      if (login) {
        const failResult = this.rateLimiter.recordFailed(key);
        if (failResult.isLocked) {
          const seconds = Math.ceil(failResult.waitMs / 1000);
          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              code: 'RATE_LIMIT_EXCEEDED',
              message: `Tài khoản của bạn đã bị tạm khóa. Vui lòng thử lại sau ${formatDuration(seconds)}.`,
              waitMs: failResult.waitMs,
              attemptCount: failResult.attemptCount,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
      throw err;
    }
  }
}

