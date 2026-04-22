import BikeBuilderPage, { type BikeBuilderPagePrefill } from '@/components/cpq/bike-builder-page';

type CpqPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

const readSearchParam = (
  searchParams: CpqPageProps['searchParams'],
  key: keyof BikeBuilderPagePrefill,
): string => {
  const raw = searchParams?.[key];
  if (Array.isArray(raw)) return (raw[0] ?? '').trim();
  return (raw ?? '').trim();
};

export default function CpqPage({ searchParams }: CpqPageProps) {
  const prefill: BikeBuilderPagePrefill = {
    ruleset: readSearchParam(searchParams, 'ruleset'),
    country_code: readSearchParam(searchParams, 'country_code'),
    ipn_code: readSearchParam(searchParams, 'ipn_code'),
    account_code: readSearchParam(searchParams, 'account_code'),
  };

  return <BikeBuilderPage prefill={prefill} />;
}
