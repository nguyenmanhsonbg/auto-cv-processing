import type {
  FacebookPublishAttachment,
  FacebookPublishTarget,
  FacebookReviewStatus,
} from './types';

const DATABASE_NAME = 'vcs-facebook-image-attachments';
const DATABASE_VERSION = 1;
const RECORD_STORE_NAME = 'publish-drafts';
const LOCAL_RECORDS_STORAGE_KEY = 'vcs:facebook-image-attachment-records';
const LOCAL_RECORD_RECOVERY_MAX_AGE_MS = 30 * 60 * 1000;

const TERMINAL_REVIEW_STATUSES = new Set<FacebookReviewStatus>([
  'POSTED',
  'REJECTED',
  'DELETED',
]);

export interface FacebookImageAttachmentScope {
  recruitmentId?: string | null;
  jobDescriptionId?: string | null;
  snapshotFingerprint?: string | null;
}

export interface FacebookImagePublishTargetStatusInput {
  targetId?: string | null;
  targetExternalId?: string | null;
  targetName?: string | null;
  targetUrl?: string | null;
  facebookReviewStatus: FacebookReviewStatus;
}

interface StoredFacebookImageAttachment {
  type: 'IMAGE';
  source: FacebookPublishAttachment['source'];
  fileName: string;
  mimeType: string;
  size: number;
  blob: Blob;
}

interface StoredFacebookImageTarget {
  targetKey: string;
  targetId: string | null;
  targetExternalId: string | null;
  targetName: string;
  targetUrl: string | null;
  reviewStatus: FacebookReviewStatus | 'PENDING';
}

interface StoredFacebookImageRecord {
  scopeKey: string;
  recruitmentId: string | null;
  jobDescriptionId: string | null;
  snapshotFingerprint: string | null;
  jobPostingId: string | null;
  attachments: StoredFacebookImageAttachment[];
  targets: StoredFacebookImageTarget[];
  updatedAt: string;
}

interface LocalFacebookImageRecord {
  scopeKey: string;
  recruitmentId: string | null;
  jobDescriptionId: string | null;
  snapshotFingerprint: string | null;
  jobPostingId: string | null;
  attachments: FacebookPublishAttachment[];
  targets: StoredFacebookImageTarget[];
  updatedAt: string;
}

export function buildFacebookImageAttachmentScopeKey(scope: FacebookImageAttachmentScope) {
  const recruitmentId = scope.recruitmentId?.trim();
  const jobDescriptionId = scope.jobDescriptionId?.trim();
  const snapshotFingerprint = scope.snapshotFingerprint?.trim();

  if (recruitmentId) return `recruitment:${recruitmentId}|snapshot:${snapshotFingerprint ?? ''}`;
  if (snapshotFingerprint) return `snapshot:${snapshotFingerprint}`;
  if (jobDescriptionId) return `job-description:${jobDescriptionId}`;
  return '';
}

export async function saveFacebookImageAttachments(
  scope: FacebookImageAttachmentScope,
  attachments: FacebookPublishAttachment[],
) {
  if (attachments.length === 0) {
    await removeFacebookImageAttachments(scope);
    return;
  }

  const scopeKey = buildFacebookImageAttachmentScopeKey(scope);
  if (!scopeKey.replace(/\|/g, '')) {
    throw new Error('Không thể lưu ảnh vì chưa xác định được bài đăng hiện tại.');
  }

  const existingLocal = await findLocalRecordForScope(scope);
  const existing = await findRecordForScope(scope);
  const updatedAt = new Date().toISOString();
  const record: StoredFacebookImageRecord = {
    scopeKey,
    recruitmentId: scope.recruitmentId ?? null,
    jobDescriptionId: scope.jobDescriptionId ?? null,
    snapshotFingerprint: scope.snapshotFingerprint ?? null,
    jobPostingId: existingLocal?.jobPostingId ?? existing?.jobPostingId ?? null,
    attachments: await Promise.all(attachments.map(toStoredAttachment)),
    targets: existingLocal?.targets ?? existing?.targets ?? [],
    updatedAt,
  };

  await writeLocalScopedRecord(scope, {
    ...record,
    attachments: attachments.map(cloneRuntimeAttachment),
  }, existingLocal?.scopeKey);
  await writeScopedRecord(scope, record, existing?.scopeKey);
}

export async function getFacebookImageAttachments(scope: FacebookImageAttachmentScope) {
  const localRecord = await findLocalRecordForScope(scope);
  if (localRecord?.attachments.length) {
    return localRecord.attachments.map(cloneRuntimeAttachment);
  }

  const record = await findRecordForScope(scope);
  if (!record || record.attachments.length === 0) return [];

  const attachments = await Promise.all(record.attachments.map(toRuntimeAttachment));
  await writeLocalScopedRecord(scope, {
    ...record,
    attachments: attachments.map(cloneRuntimeAttachment),
  });
  return attachments;
}

export async function removeFacebookImageAttachments(scope: FacebookImageAttachmentScope) {
  const scopeKey = buildFacebookImageAttachmentScopeKey(scope);
  if (!scopeKey) return;
  const localRecord = await findLocalRecordForScope(scope);
  if (localRecord) await deleteLocalRecord(localRecord.scopeKey);
  const record = await findRecordForScope(scope);
  if (record) await deleteRecord(record.scopeKey);
}

export async function beginFacebookImagePublish(
  scope: FacebookImageAttachmentScope,
  jobPostingId: string,
  targets: FacebookPublishTarget[],
) {
  const scopeKey = buildFacebookImageAttachmentScopeKey(scope);
  if (!scopeKey.replace(/\|/g, '')) return;

  let existingLocal = await findLocalRecordForScope(scope);
  const existing = await findRecordForScope(scope);
  if (!existingLocal && existing?.attachments.length) {
    const attachments = await Promise.all(existing.attachments.map(toRuntimeAttachment));
    existingLocal = {
      ...existing,
      attachments,
    };
  }
  if (!existing || existing.attachments.length === 0) return;

  const nextRecord: StoredFacebookImageRecord = {
    ...existing,
    jobPostingId,
    targets: targets.map((target) => ({
      targetKey: buildFacebookImageTargetKey(target),
      targetId: target.targetId ?? null,
      targetExternalId: target.targetExternalId ?? null,
      targetName: target.targetName,
      targetUrl: target.targetUrl ?? null,
      reviewStatus: 'PENDING',
    })),
    updatedAt: new Date().toISOString(),
  };

  if (existingLocal?.attachments.length) {
    await writeLocalScopedRecord(scope, {
      ...nextRecord,
      attachments: existingLocal.attachments.map(cloneRuntimeAttachment),
    }, existingLocal.scopeKey);
  }
  await writeScopedRecord(scope, nextRecord, existing.scopeKey);
}

export async function updateFacebookImagePublishTargetStatus(
  input: FacebookImagePublishTargetStatusInput & { jobPostingId: string },
) {
  let released = await updateLocalFacebookImagePublishTargetStatus(input);
  const records = await readAllRecords();
  const matching = records.filter((record) => record.jobPostingId === input.jobPostingId);

  for (const record of matching) {
    const targetKey = buildFacebookImageTargetKey(input);
    const targetIndex = record.targets.findIndex((target) => (
      target.targetKey === targetKey || areFacebookImageTargetsEqual(target, input)
    ));
    if (targetIndex < 0) continue;

    const nextTargets = record.targets.map((target, index) => (
      index === targetIndex
        ? { ...target, reviewStatus: input.facebookReviewStatus }
        : target
    ));

    if (nextTargets.length > 0 && nextTargets.every((target) => (
      TERMINAL_REVIEW_STATUSES.has(target.reviewStatus as FacebookReviewStatus)
    ))) {
      await deleteRecord(record.scopeKey);
      released = true;
      continue;
    }

    await writeRecord({
      ...record,
      targets: nextTargets,
      updatedAt: new Date().toISOString(),
    });
  }

  return released;
}

export async function syncFacebookImagePublishStatuses(
  items: Array<FacebookImagePublishTargetStatusInput & { jobPostingId: string }>,
) {
  let released = false;
  for (const item of items) {
    released = (await updateFacebookImagePublishTargetStatus(item)) || released;
  }
  return released;
}

function buildFacebookImageTargetKey(target: {
  targetId?: string | null;
  targetExternalId?: string | null;
  targetName?: string | null;
  targetUrl?: string | null;
}) {
  if (target.targetId?.trim()) return `id:${target.targetId.trim()}`;
  if (target.targetExternalId?.trim()) return `external:${target.targetExternalId.trim()}`;
  if (target.targetUrl?.trim()) return `url:${target.targetUrl.trim()}`;
  return `name:${target.targetName?.trim() ?? ''}`;
}

function areFacebookImageTargetsEqual(
  stored: StoredFacebookImageTarget,
  input: FacebookImagePublishTargetStatusInput,
) {
  if (stored.targetId && input.targetId) return stored.targetId === input.targetId;
  if (stored.targetExternalId && input.targetExternalId) {
    return stored.targetExternalId === input.targetExternalId;
  }
  if (stored.targetUrl && input.targetUrl) return stored.targetUrl === input.targetUrl;
  return Boolean(stored.targetName && input.targetName && stored.targetName === input.targetName);
}

async function toStoredAttachment(attachment: FacebookPublishAttachment): Promise<StoredFacebookImageAttachment> {
  const response = await fetch(attachment.dataUrl);
  if (!response.ok) {
    throw new Error(`Không thể lưu ảnh ${attachment.fileName || 'đã chọn'}.`);
  }

  return {
    type: 'IMAGE',
    source: attachment.source,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    blob: await response.blob(),
  };
}

async function toRuntimeAttachment(attachment: StoredFacebookImageAttachment): Promise<FacebookPublishAttachment> {
  return {
    type: attachment.type,
    source: attachment.source,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    dataUrl: await blobToDataUrl(attachment.blob),
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Không thể khôi phục ảnh đã lưu.'));
    };
    reader.onerror = () => reject(new Error(reader.error?.message ?? 'Không thể khôi phục ảnh đã lưu.'));
    reader.readAsDataURL(blob);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Trình duyệt không hỗ trợ lưu ảnh bền vững.'));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(RECORD_STORE_NAME)) {
        request.result.createObjectStore(RECORD_STORE_NAME, { keyPath: 'scopeKey' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Không thể mở kho lưu ảnh.'));
  });
}

function readRecord(scopeKey: string): Promise<StoredFacebookImageRecord | null> {
  return withStore('readonly', (store) => store.get(scopeKey));
}

function readAllRecords(): Promise<StoredFacebookImageRecord[]> {
  return withStore('readonly', (store) => store.getAll());
}

function writeRecord(record: StoredFacebookImageRecord) {
  return withStore('readwrite', (store) => store.put(record));
}

function deleteRecord(scopeKey: string) {
  return withStore('readwrite', (store) => store.delete(scopeKey));
}

function cloneRuntimeAttachment(attachment: FacebookPublishAttachment): FacebookPublishAttachment {
  return {
    type: attachment.type,
    source: attachment.source,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    dataUrl: attachment.dataUrl,
  };
}

async function readLocalRecords(): Promise<LocalFacebookImageRecord[]> {
  const values = await chrome.storage?.local?.get(LOCAL_RECORDS_STORAGE_KEY);
  const records = values?.[LOCAL_RECORDS_STORAGE_KEY];
  return Array.isArray(records) ? records.filter(isLocalRecord) : [];
}

async function writeLocalRecords(records: LocalFacebookImageRecord[]) {
  await chrome.storage?.local?.set({
    [LOCAL_RECORDS_STORAGE_KEY]: records,
  });
}

async function findLocalRecordForScope(scope: FacebookImageAttachmentScope) {
  const scopeKey = buildFacebookImageAttachmentScopeKey(scope);
  if (!scopeKey) return null;

  const records = await readLocalRecords();
  const exact = records.find((record) => record.scopeKey === scopeKey);
  if (exact) return exact;

  const recruitmentId = scope.recruitmentId?.trim();
  const jobDescriptionId = scope.jobDescriptionId?.trim();
  if (!recruitmentId && !jobDescriptionId) return null;

  const matching = records
    .filter((record) => record.attachments.length > 0)
    .filter((record) => (
      (Boolean(recruitmentId) && record.recruitmentId === recruitmentId)
        || (Boolean(jobDescriptionId) && record.jobDescriptionId === jobDescriptionId)
    ))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  if (matching.length > 0) return matching[0];

  const recent = records.filter((record) => (
    record.attachments.length > 0
      && Date.now() - Date.parse(record.updatedAt) <= LOCAL_RECORD_RECOVERY_MAX_AGE_MS
  ));
  return recent.length === 1 ? recent[0] : null;
}

async function writeLocalScopedRecord(
  scope: FacebookImageAttachmentScope,
  record: LocalFacebookImageRecord,
  previousScopeKey?: string,
) {
  const scopeKey = buildFacebookImageAttachmentScopeKey(scope);
  if (!scopeKey) return;

  const records = await readLocalRecords();
  const nextRecord: LocalFacebookImageRecord = {
    ...record,
    scopeKey,
    recruitmentId: scope.recruitmentId?.trim() ?? null,
    jobDescriptionId: scope.jobDescriptionId?.trim() ?? null,
    snapshotFingerprint: scope.snapshotFingerprint?.trim() ?? null,
    attachments: record.attachments.map(cloneRuntimeAttachment),
  };
  const retained = records.filter((item) => (
    item.scopeKey !== scopeKey && item.scopeKey !== previousScopeKey
  ));
  await writeLocalRecords([...retained, nextRecord]);
}

async function deleteLocalRecord(scopeKey: string) {
  const records = await readLocalRecords();
  await writeLocalRecords(records.filter((record) => record.scopeKey !== scopeKey));
}

async function updateLocalFacebookImagePublishTargetStatus(
  input: FacebookImagePublishTargetStatusInput & { jobPostingId: string },
) {
  const records = await readLocalRecords();
  let changed = false;
  let released = false;
  const nextRecords: LocalFacebookImageRecord[] = [];

  for (const record of records) {
    if (record.jobPostingId !== input.jobPostingId) {
      nextRecords.push(record);
      continue;
    }

    const targetKey = buildFacebookImageTargetKey(input);
    const targetIndex = record.targets.findIndex((target) => (
      target.targetKey === targetKey || areFacebookImageTargetsEqual(target, input)
    ));
    if (targetIndex < 0) {
      nextRecords.push(record);
      continue;
    }

    changed = true;
    const targets = record.targets.map((target, index) => (
      index === targetIndex
        ? { ...target, reviewStatus: input.facebookReviewStatus }
        : target
    ));
    if (targets.length > 0 && targets.every((target) => (
      TERMINAL_REVIEW_STATUSES.has(target.reviewStatus as FacebookReviewStatus)
    ))) {
      released = true;
      continue;
    }

    nextRecords.push({
      ...record,
      targets,
      updatedAt: new Date().toISOString(),
    });
  }

  if (changed) await writeLocalRecords(nextRecords);
  return released;
}

function isLocalRecord(value: unknown): value is LocalFacebookImageRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<LocalFacebookImageRecord>;
  return typeof record.scopeKey === 'string'
    && Array.isArray(record.attachments)
    && record.attachments.every((attachment) => (
      typeof attachment === 'object'
        && attachment !== null
        && (attachment as FacebookPublishAttachment).type === 'IMAGE'
        && typeof (attachment as FacebookPublishAttachment).dataUrl === 'string'
    ))
    && Array.isArray(record.targets)
    && typeof record.updatedAt === 'string';
}

async function findRecordForScope(scope: FacebookImageAttachmentScope) {
  const scopeKey = buildFacebookImageAttachmentScopeKey(scope);
  if (!scopeKey) return null;

  const exact = await readRecord(scopeKey);
  if (exact) return exact;

  const recruitmentId = scope.recruitmentId?.trim();
  const jobDescriptionId = scope.jobDescriptionId?.trim();
  if (!recruitmentId && !jobDescriptionId) return null;

  // AMIS can normalize the saved snapshot after submit, changing its fingerprint.
  // Keep the attachment bound to the same recruitment/JD instead of silently
  // falling back to a text-only publish when that happens.
  const candidates = (await readAllRecords())
    .filter((record) => record.attachments.length > 0)
    .filter((record) => (
      (Boolean(recruitmentId) && record.recruitmentId === recruitmentId)
        || (Boolean(jobDescriptionId) && record.jobDescriptionId === jobDescriptionId)
    ))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return candidates[0] ?? null;
}

async function writeScopedRecord(
  scope: FacebookImageAttachmentScope,
  record: StoredFacebookImageRecord,
  previousScopeKey?: string,
) {
  const scopeKey = buildFacebookImageAttachmentScopeKey(scope);
  if (!scopeKey) return;

  await writeRecord({
    ...record,
    scopeKey,
    recruitmentId: scope.recruitmentId?.trim() ?? null,
    jobDescriptionId: scope.jobDescriptionId?.trim() ?? null,
    snapshotFingerprint: scope.snapshotFingerprint?.trim() ?? null,
  });

  if (previousScopeKey && previousScopeKey !== scopeKey) {
    await deleteRecord(previousScopeKey);
  }
}

function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    void openDatabase().then((database) => {
      const transaction = database.transaction(RECORD_STORE_NAME, mode);
      const request = operation(transaction.objectStore(RECORD_STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Không thể cập nhật kho lưu ảnh.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Không thể cập nhật kho lưu ảnh.'));
      transaction.oncomplete = () => database.close();
    }).catch(reject);
  });
}
