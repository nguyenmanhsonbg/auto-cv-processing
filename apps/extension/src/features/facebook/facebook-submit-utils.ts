export interface FacebookComposerSubmitCandidate {
  id: string;
  dialogVisible: boolean;
  dialogLabel: string;
  hasEditor: boolean;
  buttonText: string;
  ariaLabel: string | null;
  buttonVisible: boolean;
  buttonDisabled: boolean;
  insideCommentSurface: boolean;
}

export interface FacebookSubmitReadinessState {
  pickerOpen: boolean;
  composerVisible: boolean;
  hasEditor: boolean;
  submitButtonVisible: boolean;
  submitButtonDisabled: boolean;
}

export function isFacebookSubmitReadyAfterPickerClosed(
  state: FacebookSubmitReadinessState,
) {
  return !state.pickerOpen
    && state.composerVisible
    && state.hasEditor
    && state.submitButtonVisible
    && !state.submitButtonDisabled;
}

function normalizeFacebookSubmitText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u0111|\u0110/g, 'd')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isFacebookPostSubmitLabel(value: string) {
  const normalized = normalizeFacebookSubmitText(value);
  return normalized === 'dang'
    || normalized === 'post'
    || normalized === 'dang dang'
    || normalized === 'post post';
}

export function selectFacebookComposerSubmitCandidate(
  candidates: FacebookComposerSubmitCandidate[],
) {
  return candidates.find((candidate) => {
    const labels = [candidate.ariaLabel, candidate.buttonText].filter(
      (value): value is string => Boolean(value),
    );
    const hasExactAriaSubmitLabel = candidate.ariaLabel !== null
      && (normalizeFacebookSubmitText(candidate.ariaLabel) === 'dang'
        || normalizeFacebookSubmitText(candidate.ariaLabel) === 'post');
    const hasComposerContext = normalizeFacebookSubmitText(candidate.dialogLabel).includes('tao bai viet')
      && candidate.hasEditor;

    return candidate.dialogVisible
      && candidate.buttonVisible
      && !candidate.buttonDisabled
      && !candidate.insideCommentSurface
      && (
        (hasComposerContext && labels.some(isFacebookPostSubmitLabel))
        || hasExactAriaSubmitLabel
      );
  }) ?? null;
}
