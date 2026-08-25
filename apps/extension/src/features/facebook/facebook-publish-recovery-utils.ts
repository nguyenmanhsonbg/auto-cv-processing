type FacebookSubmissionRecoveryResult = {
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  submitClickDispatched?: boolean;
};

type FacebookSubmissionEvidenceResult = FacebookSubmissionRecoveryResult & {
  message: string;
  postClickEvidence?: boolean;
};

type FacebookPostClickSurfaceState = {
  submitButtonFound: boolean;
  ariaDisabled: string | null;
  clickPointStillSubmit: boolean | null;
};

type FacebookPublishTabResult = {
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
};

export function shouldRecoverFacebookSubmittedPostUrl(result: FacebookSubmissionRecoveryResult) {
  return result.status === 'SUCCESS' || result.submitClickDispatched === true;
}

export function shouldKeepFacebookPublishTabOpenForInspection(result: FacebookPublishTabResult) {
  return result.status === 'FAILED';
}

export function inferFacebookPostClickEvidence(
  result: { postClickEvidence?: boolean },
  state: FacebookPostClickSurfaceState,
) {
  if (result.postClickEvidence === true) return true;

  return !state.submitButtonFound
    || state.ariaDisabled === 'true'
    || state.clickPointStillSubmit === false;
}

export function shouldAcceptFacebookSubmissionEvidence(result: FacebookSubmissionEvidenceResult) {
  if (result.status === 'SUCCESS') return true;
  if (!result.submitClickDispatched || !result.postClickEvidence) return false;

  return !/blocked by .*dialog|captcha|security check|checkpoint|login required|active facebook browser account does not match|group url is required|quota|daily publish limit|submit button remained enabled|click point stale|image attach failed.*(?:not to publish|did not complete)/i.test(result.message);
}
