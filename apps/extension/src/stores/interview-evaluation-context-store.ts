import type {
  AmisApplicationListItem,
  AmisRecruitmentRound,
} from '@/types/types';

const INTERVIEW_EVALUATION_CONTEXTS_STORAGE_KEY = 'vcs:interview-evaluation-contexts';

export interface InterviewEvaluationTabContext {
  application: AmisApplicationListItem;
  amisRecruitmentId: string;
  currentAmisUserId: string | null;
  amisRecruitmentRounds: AmisRecruitmentRound[];
  savedAt: string;
}

type StoredInterviewEvaluationContexts = Record<string, InterviewEvaluationTabContext>;

export async function saveInterviewEvaluationTabContext(
  context: Omit<InterviewEvaluationTabContext, 'savedAt'>,
) {
  const contexts = await readInterviewEvaluationContexts();
  contexts[context.application.applicationId] = {
    ...context,
    savedAt: new Date().toISOString(),
  };

  await chrome.storage?.session?.set({
    [INTERVIEW_EVALUATION_CONTEXTS_STORAGE_KEY]: contexts,
  });
}

export async function getInterviewEvaluationTabContext(applicationId: string) {
  const contexts = await readInterviewEvaluationContexts();
  const context = contexts[applicationId];
  return isInterviewEvaluationTabContext(context) ? context : null;
}

async function readInterviewEvaluationContexts(): Promise<StoredInterviewEvaluationContexts> {
  try {
    const stored = await chrome.storage?.session?.get(INTERVIEW_EVALUATION_CONTEXTS_STORAGE_KEY);
    const value = stored?.[INTERVIEW_EVALUATION_CONTEXTS_STORAGE_KEY];
    return isRecord(value) ? value as StoredInterviewEvaluationContexts : {};
  } catch {
    return {};
  }
}

function isInterviewEvaluationTabContext(value: unknown): value is InterviewEvaluationTabContext {
  if (!isRecord(value)) return false;
  if (!isRecord(value.application)) return false;

  return typeof value.application.applicationId === 'string'
    && typeof value.application.candidateName === 'string'
    && typeof value.amisRecruitmentId === 'string'
    && Array.isArray(value.amisRecruitmentRounds)
    && typeof value.savedAt === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
