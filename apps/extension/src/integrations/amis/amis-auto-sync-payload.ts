export function resolveSelectedVcsJobDescriptionId(selectedJobDescriptionId: string | null | undefined) {
  return selectedJobDescriptionId?.trim() || null;
}
