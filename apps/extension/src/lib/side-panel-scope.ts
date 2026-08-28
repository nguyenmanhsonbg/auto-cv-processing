import { parseInterviewEvaluationContextFromUrl } from '@/integrations/amis/amis-helpers';
import { FRONTEND_BASE_URL } from '@/lib/config';

const AMIS_HOSTNAME = 'amisapp.misa.vn';

export function isAllowedSidePanelUrl(value: string | undefined) {
  if (!value) return false;

  try {
    const parsedUrl = new URL(value);
    if (parsedUrl.hostname.toLowerCase() === AMIS_HOSTNAME) return true;

    const frontendOrigin = new URL(FRONTEND_BASE_URL).origin;
    return parsedUrl.origin === frontendOrigin
      && parseInterviewEvaluationContextFromUrl(value) !== null;
  } catch {
    return false;
  }
}
