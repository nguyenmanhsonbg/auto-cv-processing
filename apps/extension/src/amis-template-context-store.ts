const AMIS_TEMPLATE_CONTEXTS_STORAGE_KEY = 'vcs:amis-template-contexts';
const AMIS_TEMPLATE_RECRUITMENT_CONTEXTS_STORAGE_KEY = 'vcs:amis-template-recruitment-contexts';

export interface AmisTemplateContext {
  tabId: number;
  templateJobDescriptionId: string;
  templateJobDescriptionTitle: string;
  formPageUrl?: string | null;
  updatedAt: string;
}

type StoredAmisTemplateContexts = Record<string, AmisTemplateContext>;
type StoredAmisTemplateRecruitmentContexts = Record<string, AmisTemplateContext>;

export async function saveAmisTemplateContext(
  context: Omit<AmisTemplateContext, 'updatedAt'>,
) {
  const contexts = await readAmisTemplateContexts();
  contexts[String(context.tabId)] = {
    ...context,
    updatedAt: new Date().toISOString(),
  };

  await chrome.storage?.session?.set({
    [AMIS_TEMPLATE_CONTEXTS_STORAGE_KEY]: contexts,
  });
}

export async function getAmisTemplateContextForTab(tabId?: number | null) {
  if (typeof tabId !== 'number') return null;
  const contexts = await readAmisTemplateContexts();
  return contexts[String(tabId)] ?? null;
}

export async function clearAmisTemplateContextForTab(tabId?: number | null) {
  if (typeof tabId !== 'number') return;
  const contexts = await readAmisTemplateContexts();
  delete contexts[String(tabId)];

  await chrome.storage?.session?.set({
    [AMIS_TEMPLATE_CONTEXTS_STORAGE_KEY]: contexts,
  });
}

export async function saveAmisTemplateContextForRecruitment(
  recruitmentId: string,
  context: Omit<AmisTemplateContext, 'updatedAt'>,
) {
  const normalizedRecruitmentId = recruitmentId.trim();
  if (!normalizedRecruitmentId) return;

  const contexts = await readAmisTemplateRecruitmentContexts();
  contexts[normalizedRecruitmentId] = {
    ...context,
    updatedAt: new Date().toISOString(),
  };

  await chrome.storage?.local?.set({
    [AMIS_TEMPLATE_RECRUITMENT_CONTEXTS_STORAGE_KEY]: contexts,
  });
}

export async function getAmisTemplateContextForRecruitment(recruitmentId?: string | null) {
  const normalizedRecruitmentId = recruitmentId?.trim();
  if (!normalizedRecruitmentId) return null;

  const contexts = await readAmisTemplateRecruitmentContexts();
  return contexts[normalizedRecruitmentId] ?? null;
}

async function readAmisTemplateContexts(): Promise<StoredAmisTemplateContexts> {
  try {
    const stored = await chrome.storage?.session?.get(AMIS_TEMPLATE_CONTEXTS_STORAGE_KEY);
    const value = stored?.[AMIS_TEMPLATE_CONTEXTS_STORAGE_KEY];
    return isRecord(value) ? (value as StoredAmisTemplateContexts) : {};
  } catch {
    return {};
  }
}

async function readAmisTemplateRecruitmentContexts(): Promise<StoredAmisTemplateRecruitmentContexts> {
  try {
    const stored = await chrome.storage?.local?.get(AMIS_TEMPLATE_RECRUITMENT_CONTEXTS_STORAGE_KEY);
    const value = stored?.[AMIS_TEMPLATE_RECRUITMENT_CONTEXTS_STORAGE_KEY];
    return isRecord(value) ? (value as StoredAmisTemplateRecruitmentContexts) : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
