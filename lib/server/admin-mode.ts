import { NextRequest } from 'next/server';

export function assertAdminMode(req: NextRequest) {
  const isAdminMode = req.headers.get('x-admin-mode') === 'true';
  if (!isAdminMode) {
    throw new Error('Admin mode required. Re-open this page using "Open as admin" and try again.');
  }
}
