import { NextRequest, NextResponse } from 'next/server';
import { listImageManagementRows } from '@/lib/cpq/setup/service';

export async function GET(req: NextRequest) {

  const featureLabel = req.nextUrl.searchParams.get('featureLabel') ?? '';
  const onlyMissingPicture = req.nextUrl.searchParams.get('onlyMissingPicture') === 'true';

  const rows = await listImageManagementRows({
    featureLabel,
    onlyMissingPicture,
  });

  return NextResponse.json({ rows });
}
