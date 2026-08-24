// This file is deprecated - AMIS polling is not needed
// Using webhook approach instead

import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AmisPollService {
  private readonly logger = new Logger(AmisPollService.name);

  async triggerSync(): Promise<{ synced: number; errors: number }> {
    this.logger.warn('AmisPollService.triggerSync() is deprecated — using webhooks instead');
    return { synced: 0, errors: 0 };
  }
}
