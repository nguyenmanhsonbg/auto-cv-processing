const SELECTED_JOB_QUESTION_CONTEXTS_STORAGE_KEY = 'vcs:selected-job-question-contexts';

interface SelectedJobQuestionContext {
  tabId: number;
  pageUrl?: string | null;
  jobDescriptionId?: string | null;
  jobDescriptionTitle?: string | null;
  questionSetId?: string | null;
  amisCareerId?: string | null;
  careerName?: string | null;
  questionIds: string[];
  updatedAt: string;
}

type StoredSelectedJobQuestionContexts = Record<string, SelectedJobQuestionContext>;

export async function saveSelectedJobQuestionContext(context: Omit<SelectedJobQuestionContext, 'updatedAt'>) {
  const contexts = await readSelectedJobQuestionContexts();
  contexts[String(context.tabId)] = {
    ...context,
    questionIds: dedupeQuestionIds(context.questionIds),
    updatedAt: new Date().toISOString(),
  };

  await chrome.storage?.session?.set({
    [SELECTED_JOB_QUESTION_CONTEXTS_STORAGE_KEY]: contexts,
  });
}

export async function clearSelectedJobQuestionContextForTab(tabId?: number | null) {
  if (typeof tabId !== 'number') return;
  const contexts = await readSelectedJobQuestionContexts();
  delete contexts[String(tabId)];

  await chrome.storage?.session?.set({
    [SELECTED_JOB_QUESTION_CONTEXTS_STORAGE_KEY]: contexts,
  });
}

export async function getSelectedJobQuestionIdsForTab(tabId?: number | null) {
  if (typeof tabId !== 'number') return [];
  const contexts = await readSelectedJobQuestionContexts();
  return dedupeQuestionIds(contexts[String(tabId)]?.questionIds ?? []);
}

export async function getSelectedJobQuestionContextForTab(tabId?: number | null) {
  if (typeof tabId !== 'number') return null;
  const contexts = await readSelectedJobQuestionContexts();
  return contexts[String(tabId)] ?? null;
}

async function readSelectedJobQuestionContexts(): Promise<StoredSelectedJobQuestionContexts> {
  try {
    const stored = await chrome.storage?.session?.get(SELECTED_JOB_QUESTION_CONTEXTS_STORAGE_KEY);
    const value = stored?.[SELECTED_JOB_QUESTION_CONTEXTS_STORAGE_KEY];
    return isRecord(value) ? (value as StoredSelectedJobQuestionContexts) : {};
  } catch {
    return {};
  }
}

function dedupeQuestionIds(questionIds: string[]) {
  return [
    ...new Set(
      questionIds.filter((questionId) => typeof questionId === 'string' && questionId.trim().length > 0),
    ),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
