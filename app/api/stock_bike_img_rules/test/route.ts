import { NextRequest, NextResponse } from 'next/server';
import { Stock_bike_img_match_rules_by_sku } from '@/lib/Stock_bike_img_service';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { stock_bike_img_sku_code?: unknown };
  const traceId = crypto.randomUUID();

  try {
    const result = await Stock_bike_img_match_rules_by_sku(String(body.stock_bike_img_sku_code ?? ''));
    return NextResponse.json({ traceId, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        traceId,
        error: error instanceof Error ? error.message : 'Failed to evaluate SKU',
        stage: 'stock_bike_img_rules.test.POST.evaluate',
        details: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) },
      },
      { status: 400 },
    );
  }
}
