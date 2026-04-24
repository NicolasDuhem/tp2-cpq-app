import CpqSetupPage from '@/components/setup/cpq-setup-page';

type SearchParams = Record<string, string | string[] | undefined>;
type TabKey = 'accounts' | 'rulesets' | 'pictures';

const resolveSingleValue = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
};

const resolveTab = (value: string): TabKey => {
  const normalized = value.trim();
  if (normalized === 'accounts' || normalized === 'rulesets' || normalized === 'pictures') return normalized;
  return 'accounts';
};

const resolveBoolean = (value: string) => value.trim().toLowerCase() === 'true';

export default async function CpqSetupRoute({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const resolvedSearch = (await searchParams) ?? {};
  const initialTab = resolveTab(resolveSingleValue(resolvedSearch.tab));
  const initialOnlyMissingPicture = resolveBoolean(resolveSingleValue(resolvedSearch.onlyMissingPicture));
  const initialFeature = resolveSingleValue(resolvedSearch.feature).trim();

  return (
    <CpqSetupPage
      initialTab={initialTab}
      initialOnlyMissingPicture={initialOnlyMissingPicture}
      initialFeature={initialFeature}
    />
  );
}
