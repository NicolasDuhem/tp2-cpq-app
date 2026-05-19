import CpqSetupAccessClient from '@/components/setup/cpq-setup-access-client';
import { PAGE_KEYS } from '@/lib/auth/page-access';

type SearchParams = Record<string, string | string[] | undefined>;
type TabKey = 'accounts' | 'rulesets' | 'pictures';

export const dynamic = 'force-dynamic';

const resolveSingleValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] ?? '' : value ?? '';

const resolveTab = (value: string): TabKey =>
  ['accounts', 'rulesets', 'pictures'].includes(value.trim())
    ? (value.trim() as TabKey)
    : 'accounts';

const resolveBoolean = (value: string) => value.trim().toLowerCase() === 'true';

const resolvePageKeyByTab = (tab: TabKey) => {
  if (tab === 'rulesets') return PAGE_KEYS.cpqSetupRulesets;
  if (tab === 'pictures') return PAGE_KEYS.cpqSetupPictures;
  return PAGE_KEYS.cpqSetupAccounts;
};

export default async function CpqSetupRoute({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const resolvedSearch = (await searchParams) ?? {};
  const initialTab = resolveTab(resolveSingleValue(resolvedSearch.tab));
  const initialOnlyMissingPicture = resolveBoolean(resolveSingleValue(resolvedSearch.onlyMissingPicture));
  const initialFeature = resolveSingleValue(resolvedSearch.feature).trim();
  const pageKey = resolvePageKeyByTab(initialTab);

  return (
    <CpqSetupAccessClient
      pageKey={pageKey}
      initialTab={initialTab}
      initialOnlyMissingPicture={initialOnlyMissingPicture}
      initialFeature={initialFeature}
    />
  );
}
