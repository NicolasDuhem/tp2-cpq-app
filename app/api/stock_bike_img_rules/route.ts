import { NextRequest, NextResponse } from 'next/server';
import {
  Stock_bike_img_create_rule,
  Stock_bike_img_list_digit_reference_rows,
  Stock_bike_img_list_reference_categories,
  Stock_bike_img_list_rule_families,
  Stock_bike_img_list_rules,
} from '@/lib/Stock_bike_img_service';

const Stock_bike_img_to_error_payload = (error: unknown, stage: string, traceId: string) => {
  const details =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
        }
      : {
          message: String(error ?? 'Unknown error'),
        };

  return {
    traceId,
    error: 'Stock_bike_img API failure',
    stage,
    details,
  };
};

export async function GET(req: NextRequest) {
  const traceId = crypto.randomUUID();
  try {
    const modelYear = Number(req.nextUrl.searchParams.get('stock_bike_img_model_year') ?? 0);
    const categoryKeyParam =
      req.nextUrl.searchParams.get('stock_bike_img_rule_category_key') ??
      req.nextUrl.searchParams.get('stock_bike_img_rule_category') ??
      '';
    const categoryRaw = String(categoryKeyParam).trim();
    const categoryNormalized = categoryRaw.replace(/\s+/g, ' ').trim().toUpperCase();
    const safeModelYear = Number.isInteger(modelYear) && modelYear > 0 ? modelYear : undefined;
    const safeCategory = categoryRaw.length > 0 ? categoryRaw : undefined;

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
      stock_bike_img_reference_debug: {
        stock_bike_img_api_load_ok: true,
        stock_bike_img_trace_id: traceId,
        stock_bike_img_selected_category_raw: categoryRaw,
        stock_bike_img_selected_category_key: categoryNormalized,
        stock_bike_img_reference_row_count: referenceRows.length,
        stock_bike_img_reference_category_count: categories.length,
        stock_bike_img_family_count: families.length,
        stock_bike_img_group_count: families.reduce((count, family) => count + family.stock_bike_img_groups.length, 0),
        stock_bike_img_available_category_keys: categories.map((entry) => entry.stock_bike_img_rule_category_key),
      },
    });
  } catch (error) {
    return NextResponse.json(
      Stock_bike_img_to_error_payload(error, 'stock_bike_img_rules.GET.load', traceId),
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const traceId = crypto.randomUUID();

  try {
    const row = await Stock_bike_img_create_rule(body);
    return NextResponse.json({ row }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create Stock_bike_img rule';
    const status = message.toLowerCase().includes('duplicate') || message.toLowerCase().includes('unique') ? 409 : 400;
    return NextResponse.json(
      {
        traceId,
        error: message,
        stage: 'stock_bike_img_rules.POST.create',
        details: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) },
      },
      { status },
    );
  }
}
