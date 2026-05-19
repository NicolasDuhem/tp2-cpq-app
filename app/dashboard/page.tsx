import DashboardPage from '@/components/dashboard/dashboard-page';
import { getDashboardPageData } from '@/lib/dashboard/service';

export const dynamic = 'force-dynamic';

export default async function DashboardRoute({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const resolved = (await searchParams) ?? {};
  const data = await getDashboardPageData(resolved);
  return <DashboardPage data={data} />;
}
