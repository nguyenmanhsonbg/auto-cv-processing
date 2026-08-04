export function resolveAutoSyncJobDescriptionId(
  selectedJobDescriptionId: string | null | undefined,
  syncedJobDescriptionId: string | null | undefined,
) {
  return selectedJobDescriptionId?.trim() || syncedJobDescriptionId?.trim() || null;
}
