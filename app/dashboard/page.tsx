import DashboardPage from '@/components/dashboard/dashboard-page';
import { getDashboardPageData } from '@/lib/dashboard/service';

export const dynamic = 'force-dynamic';

export default async function DashboardRoute() {
  const data = await getDashboardPageData();
  return <DashboardPage data={data} />;
}
