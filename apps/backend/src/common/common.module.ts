import { Module, Global } from '@nestjs/common';
import { RateLimiterService } from './services/rate-limiter.service';
import { ProgressiveRateLimitGuard } from './guards/progressive-rate-limit.guard';

@Global()
@Module({
  providers: [RateLimiterService, ProgressiveRateLimitGuard],
  exports: [RateLimiterService, ProgressiveRateLimitGuard],
})
export class CommonModule {}
