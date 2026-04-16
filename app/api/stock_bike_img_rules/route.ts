import { NextRequest, NextResponse } from 'next/server';
import {
  Stock_bike_img_create_rule,
  Stock_bike_img_list_digit_reference_rows,
  Stock_bike_img_list_reference_categories,
  Stock_bike_img_list_rule_families,
  Stock_bike_img_list_rules,
} from '@/lib/Stock_bike_img_service';

export async function GET(req: NextRequest) {
  const modelYear = Number(req.nextUrl.searchParams.get('stock_bike_img_model_year') ?? 0);
  const category = String(req.nextUrl.searchParams.get('stock_bike_img_rule_category') ?? '').trim();
  const safeModelYear = Number.isInteger(modelYear) && modelYear > 0 ? modelYear : undefined;
  const safeCategory = category.length > 0 ? category : undefined;

  const [rows, categories, referenceRows, families] = await Promise.all([
    Stock_bike_img_list_rules(safeModelYear, safeCategory),
    Stock_bike_img_list_reference_categories(),
    Stock_bike_img_list_digit_reference_rows(safeCategory),
    Stock_bike_img_list_rule_families(),
  ]);

  return NextResponse.json({
    rows,
    stock_bike_img_reference_categories: categories,
    stock_bike_img_reference_rows: referenceRows,
    stock_bike_img_rule_families: families,
  });
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
