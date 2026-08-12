import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';

export const QPART_UPDATE_ALL_COOKIE = 'qpart_update_all_auth';

const DEFAULT_QPART_UPDATE_ALL_PASSWORD = 'Br0mpt0n2026!';
const TOKEN_MESSAGE = 'sales/qpart-allocation:update-all';

function configuredPassword() {
  return process.env.QPART_UPDATE_ALL_PASSWORD || DEFAULT_QPART_UPDATE_ALL_PASSWORD;
}

function expectedToken() {
  return createHmac('sha256', configuredPassword()).update(TOKEN_MESSAGE).digest('hex');
}

export function verifyQPartUpdateAllPassword(password: unknown) {
  const provided = String(password ?? '');
  const expected = configuredPassword();
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

export function createQPartUpdateAllToken() {
  return expectedToken();
}

export function verifyQPartUpdateAllToken(token: unknown) {
  const provided = String(token ?? '');
  const expected = expectedToken();
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}
