const AMIS_TEMPLATE_CONTEXTS_STORAGE_KEY = 'vcs:amis-template-contexts';

export interface AmisTemplateContext {
  tabId: number;
  templateJobDescriptionId: string;
  templateJobDescriptionTitle: string;
  formPageUrl?: string | null;
  updatedAt: string;
}

type StoredAmisTemplateContexts = Record<string, AmisTemplateContext>;

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

async function readAmisTemplateContexts(): Promise<StoredAmisTemplateContexts> {
  try {
    const stored = await chrome.storage?.session?.get(AMIS_TEMPLATE_CONTEXTS_STORAGE_KEY);
    const value = stored?.[AMIS_TEMPLATE_CONTEXTS_STORAGE_KEY];
    return isRecord(value) ? (value as StoredAmisTemplateContexts) : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
