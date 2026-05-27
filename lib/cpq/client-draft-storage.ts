export const CPQ_DRAFT_STORAGE_KEY = 'tp2-cpq:cpq-page-state:v1';

export type CpqConfiguratorDraft = {
  version: 1;
  savedAt: string;
  accountCode: string | null;
  accountContextId: number | null;
  ruleset: string | null;
  sessionId: string | null;
  headerId: string | null;
  detailId: string | null;
  sourceHeaderId: string | null;
  sourceDetailId: string | null;
  selectedOptions: Record<string, string>;
  dropdownOrderSnapshot: Array<{ featureId: string; selectedOptionId: string | null }>;
  cpqResponse: unknown | null;
  featuresSnapshot: unknown | null;
  countryCode: string | null;
  currencyCode: string | null;
  language: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export const readCpqDraft = (): CpqConfiguratorDraft | null => {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(CPQ_DRAFT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1 || typeof parsed.savedAt !== 'string') return null;
    return parsed as CpqConfiguratorDraft;
  } catch {
    return null;
  }
};

export const saveCpqDraft = (draft: CpqConfiguratorDraft): void => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(CPQ_DRAFT_STORAGE_KEY, JSON.stringify(draft));
};

export const clearCpqDraft = (): void => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(CPQ_DRAFT_STORAGE_KEY);
};
