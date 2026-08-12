import { NextRequest, NextResponse } from 'next/server';
import { PAGE_KEYS } from '@/lib/auth/page-keys';
import { requirePageRead } from '@/lib/auth/page-access';
import { getAllocationAuditHistory } from '@/lib/sales/allocation-audit/service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const forbidden = await requirePageRead(PAGE_KEYS.salesAllocationAudit);
  if (forbidden) return forbidden;
  const q = req.nextUrl.searchParams;
  const itemCode = String(q.get('itemCode') ?? '').trim();
  if (!itemCode) return NextResponse.json({ rows: [], pagination: { limit: 100, offset: 0, totalRows: 0 } });
  const data = await getAllocationAuditHistory({
    itemCode,
    entityType: (q.get('entityType') as 'all' | 'bike' | 'qpart' | null) ?? 'all',
    countryCode: q.get('countryCode') ?? undefined,
    dateFrom: q.get('dateFrom') ?? undefined,
    dateTo: q.get('dateTo') ?? undefined,
    limit: q.get('limit') ? Number(q.get('limit')) : undefined,
    offset: q.get('offset') ? Number(q.get('offset')) : undefined,
    sort: q.get('sort') === 'asc' ? 'asc' : 'desc',
  });
  return NextResponse.json(data);
}
