/**
 * Minimal RFC 4180 CSV serialization.
 *
 * Dependency-free and pure so it can be unit tested with `node --test`.
 */

/** Quote a single field only when it needs it, doubling embedded quotes. */
export function toCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (text === '') return '';
  // Leading/trailing whitespace is preserved by quoting, which keeps codes intact.
  if (/[",\r\n]/.test(text) || text !== text.trim()) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsvRow(values: unknown[]): string {
  return values.map(toCsvField).join(',');
}

/**
 * Serialize a header row plus data rows using CRLF line endings.
 *
 * `withBom` prepends a UTF-8 byte-order mark, which is what makes Excel open
 * the file in the right encoding instead of mangling accented country names.
 */
export function toCsv(header: string[], rows: unknown[][], options: { withBom?: boolean } = {}): string {
  const lines = [toCsvRow(header), ...rows.map(toCsvRow)];
  const body = `${lines.join('\r\n')}\r\n`;
  return options.withBom ? `﻿${body}` : body;
}

/** Filename-safe timestamp, e.g. `2026-09-30_1042`. */
export function csvTimestamp(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}_${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`;
}
