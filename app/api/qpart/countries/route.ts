import { NextResponse } from 'next/server';
import { listQPartAllocationCountries } from '@/lib/qpart/allocation/service';

export async function GET() {
  const countries = await listQPartAllocationCountries();
  return NextResponse.json({ countries });
}
