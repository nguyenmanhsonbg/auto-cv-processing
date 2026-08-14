import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { EntityManager } from 'typeorm';
import { AuditLogEntity } from '../audit-logs/entities/audit-log.entity';

export async function readCvMagicBytes(filePath: string, byteCount: number) {
  const fileHandle = await open(filePath, 'r');

  try {
    const buffer = Buffer.alloc(byteCount);
    const { bytesRead } = await fileHandle.read(buffer, 0, byteCount, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await fileHandle.close();
  }
}

export function calculateCvSha256(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export async function recordCvAuditLog(
  manager: EntityManager,
  input: {
    applicationId: string;
    actorType: string;
    actorId?: string | null;
    action: string;
    objectId: string;
    metadata: Record<string, unknown>;
  },
) {
  const auditRepo = manager.getRepository(AuditLogEntity);
  await auditRepo.save(auditRepo.create({
    actorType: input.actorType,
    actorId: input.actorId?.trim() || null,
    action: input.action,
    objectType: 'CV_DOCUMENT',
    objectId: input.objectId,
    applicationId: input.applicationId,
    metadata: input.metadata,
    ipAddress: null,
    userAgent: null,
  }));
}
