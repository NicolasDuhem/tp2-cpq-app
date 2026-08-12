import { NextResponse } from 'next/server';
import { getBaseLocale, listSupportedLocales } from '@/lib/qpart/locales/service';

export async function GET() {
  const locales = await listSupportedLocales();
  const baseLocale = await getBaseLocale();
  return NextResponse.json({ locales, baseLocale });
}
