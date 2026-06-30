import { UserRole } from '@interview-assistant/shared';
import { Injectable, NotImplementedException } from '@nestjs/common';
import { SyncAmisJobPostingDto } from './dto';
import { createAmisSnapshotHash, createExtensionRequestHash } from './utils';

export interface ExtensionSyncContext {
  actorUserId: string;
  actorRole: UserRole;
  idempotencyKey: string;
  requestId?: string;
  extensionVersion?: string;
}

@Injectable()
export class ExtensionIntegrationService {
  async syncAndPublishFromAmis(
    dto: SyncAmisJobPostingDto,
    context: ExtensionSyncContext,
  ): Promise<never> {
    const requestHash = createExtensionRequestHash({
      body: dto,
      sourceSystem: dto.sourceSystem,
    });
    const snapshotHash = createAmisSnapshotHash(dto.snapshot);

    void requestHash;
    void snapshotHash;
    void context;

    // TODO BE-EXT-05/06/07/08:
    // Wrap domain sync/publish in idempotency begin/succeeded/failed flow.
    throw new NotImplementedException({
      code: 'EXTENSION_INTEGRATION_NOT_IMPLEMENTED',
      message: 'Extension integration sync-and-publish business flow is not implemented yet.',
    });
  }
}
