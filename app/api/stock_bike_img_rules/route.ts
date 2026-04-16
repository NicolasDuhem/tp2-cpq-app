import { NextRequest, NextResponse } from 'next/server';
import { Stock_bike_img_create_rule, Stock_bike_img_list_rules } from '@/lib/Stock_bike_img_service';

export async function GET(req: NextRequest) {
  const modelYear = Number(req.nextUrl.searchParams.get('stock_bike_img_model_year') ?? 0);
  const rows = await Stock_bike_img_list_rules(Number.isInteger(modelYear) && modelYear > 0 ? modelYear : undefined);
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const row = await Stock_bike_img_create_rule(body);
    return NextResponse.json({ row }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create Stock_bike_img rule';
    const status = message.toLowerCase().includes('duplicate') || message.toLowerCase().includes('unique') ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
