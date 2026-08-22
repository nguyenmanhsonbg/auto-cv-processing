import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { RateLimiterService } from '../services/rate-limiter.service';

export interface ProgressiveRateLimitOptions {
  /** Unique key for this rate limit rule */
  key: string;
  /** Build the identifier from the request (e.g., IP, email, userId) */
  identifier?: (req: Request) => string;
  /** Whether to use IP as fallback when identifier is not provided */
  useIpFallback?: boolean;
}

@Injectable()
export class ProgressiveRateLimitGuard implements CanActivate {
  constructor(private rateLimiter: RateLimiterService) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.getOptions(context);
    if (!options) return true;

    const identifier = this.resolveIdentifier(context, options);
    const result = this.rateLimiter.check(identifier);

    if (!result.allowed) {
      const seconds = Math.ceil(result.waitMs / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Vui lòng thử lại sau ${seconds} giây.`,
          waitMs: result.waitMs,
          attemptCount: result.attemptCount,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private getOptions(context: ExecutionContext): ProgressiveRateLimitOptions | null {
    const handler = context.getHandler();
    return Reflect.getMetadata('rate_limit_options', handler) ?? null;
  }

  private resolveIdentifier(
    context: ExecutionContext,
    options: ProgressiveRateLimitOptions,
  ): string {
    const req = context.switchToHttp().getRequest<Request>();

    if (options.identifier) {
      return `${options.key}:${options.identifier(req)}`;
    }

    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.ip ??
      req.socket.remoteAddress ??
      'unknown';

    return `${options.key}:${ip}`;
  }
}

/**
 * Decorator to apply progressive rate limit to an endpoint.
 */
export function ProgressiveRateLimit(options: ProgressiveRateLimitOptions) {
  return function (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    Reflect.defineMetadata('rate_limit_options', options, descriptor.value);
    return descriptor;
  };
}
