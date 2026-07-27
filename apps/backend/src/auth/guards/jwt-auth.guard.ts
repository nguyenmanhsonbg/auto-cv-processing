import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@interview-assistant/shared';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(
    err: unknown,
    user: TUser & { role?: UserRole } | undefined,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      throw (err as Error | undefined) ?? new UnauthorizedException();
    }

    if (user.role === UserRole.FREELANCER && !this.isAllowedFreelancerPath(context)) {
      throw new ForbiddenException(
        'Freelancer access is limited to freelancer self-service routes.',
      );
    }

    return user;
  }

  private isAllowedFreelancerPath(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
    }>();
    const method = request.method?.toUpperCase();
    const path = (request.originalUrl ?? request.url ?? '').split('?')[0];

    return (
      (method === 'GET' && path === '/api/auth/me') ||
      path === '/api/freelancers/me' ||
      path.startsWith('/api/freelancers/me/')
    );
  }
}
