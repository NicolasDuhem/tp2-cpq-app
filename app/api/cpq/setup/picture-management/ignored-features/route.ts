import { NextResponse } from 'next/server';
import { listIgnoredFeatureLabelsForConfigure } from '@/lib/cpq/setup/service';

export async function GET() {
  const featureLabels = await listIgnoredFeatureLabelsForConfigure();
  return NextResponse.json({ featureLabels });
}
