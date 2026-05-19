import PageAccessGate from '@/components/auth/page-access-gate';
import CpqSetupPage from '@/components/setup/cpq-setup-page';
import { PAGE_KEYS } from '@/lib/auth/page-access';

type SearchParams = Record<string, string | string[] | undefined>;
type TabKey = 'accounts' | 'rulesets' | 'pictures';

const resolveSingleValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? '' : value ?? '';
const resolveTab = (value: string): TabKey => (['accounts','rulesets','pictures'].includes(value.trim()) ? value.trim() as TabKey : 'accounts');
const resolveBoolean = (value: string) => value.trim().toLowerCase() === 'true';

export default async function CpqSetupRoute({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const resolvedSearch = (await searchParams) ?? {};
  const initialTab = resolveTab(resolveSingleValue(resolvedSearch.tab));
  const initialOnlyMissingPicture = resolveBoolean(resolveSingleValue(resolvedSearch.onlyMissingPicture));
  const initialFeature = resolveSingleValue(resolvedSearch.feature).trim();

  return <PageAccessGate pageKey={PAGE_KEYS.cpqSetup}>{(access)=><CpqSetupPage initialTab={initialTab} initialOnlyMissingPicture={initialOnlyMissingPicture} initialFeature={initialFeature} canEdit={access.canEdit} permissionLevel={access.permissionLevel} />}</PageAccessGate>;
}
