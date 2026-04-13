import { NextRequest, NextResponse } from 'next/server';
import { resolveImageLayersForSelectedOptions } from '@/lib/cpq/setup/service';

type SelectedOptionInput = {
  featureLabel?: unknown;
  optionLabel?: unknown;
  optionValue?: unknown;
};

export async function POST(req: NextRequest) {

  const body = (await req.json().catch(() => ({}))) as { selectedOptions?: SelectedOptionInput[] };
  const selectedOptions = Array.isArray(body.selectedOptions) ? body.selectedOptions : [];

  const result = await resolveImageLayersForSelectedOptions(
    selectedOptions.map((selection) => ({
      featureLabel: String(selection.featureLabel ?? '').trim(),
      optionLabel: String(selection.optionLabel ?? '').trim(),
      optionValue: String(selection.optionValue ?? '').trim(),
    })),
  );

  return NextResponse.json(result);
}
