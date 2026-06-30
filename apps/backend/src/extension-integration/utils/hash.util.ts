import { createHash } from 'crypto';
import { AmisJobSnapshotDto, SyncAmisJobPostingDto } from '../dto';
import { ExtensionSourceSystem } from '../enums';
import { stableStringify } from './stable-json.util';

const SNAPSHOT_VOLATILE_KEYS = new Set([
  'capturedAt',
  'extensionVersion',
  'requestId',
  'idempotencyKey',
]);

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function createExtensionRequestHash(input: {
  body: SyncAmisJobPostingDto;
  sourceSystem: ExtensionSourceSystem;
}): string {
  const bodyForHash = { ...input.body };
  delete bodyForHash.idempotencyKey;

  return sha256Hex(stableStringify({
    sourceSystem: input.sourceSystem,
    body: bodyForHash,
  }));
}

export function createAmisSnapshotHash(snapshot: AmisJobSnapshotDto): string {
  return sha256Hex(stableStringify(stripSnapshotVolatileFields(snapshot)));
}

function stripSnapshotVolatileFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripSnapshotVolatileFields(item));
  }

  if (typeof value !== 'object' || value === null || value instanceof Date) {
    return value;
  }

  return Object.keys(value as Record<string, unknown>).reduce<Record<string, unknown>>(
    (accumulator, key) => {
      if (!SNAPSHOT_VOLATILE_KEYS.has(key)) {
        accumulator[key] = stripSnapshotVolatileFields((value as Record<string, unknown>)[key]);
      }
      return accumulator;
    },
    {},
  );
}
