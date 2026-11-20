import 'server-only';

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import type { AccreditationActor } from '@/lib/sales/accreditation-allocation/service';

export async function currentAccreditationActor(): Promise<AccreditationActor> {
  const user = await getCurrentUser();
  return user ? { userId: user.id, email: user.email, displayName: user.displayName } : null;
}

export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  return ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
}

export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export function errorResponse(error: unknown, fallback: string, status = 400) {
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status });
}
