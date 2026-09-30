import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { csvTimestamp, toCsv, toCsvField, toCsvRow } from './csv.ts';

describe('toCsvField', () => {
  it('leaves simple values unquoted', () => {
    assert.equal(toCsvField('GB'), 'GB');
    assert.equal(toCsvField(42), '42');
  });

  it('renders null and undefined as empty', () => {
    assert.equal(toCsvField(null), '');
    assert.equal(toCsvField(undefined), '');
  });

  it('quotes values containing a comma', () => {
    assert.equal(toCsvField('Racing Green, Gloss'), '"Racing Green, Gloss"');
  });

  it('quotes and doubles embedded quotes', () => {
    assert.equal(toCsvField('12" wheel'), '"12"" wheel"');
  });

  it('quotes values containing newlines', () => {
    assert.equal(toCsvField('line1\nline2'), '"line1\nline2"');
    assert.equal(toCsvField('line1\r\nline2'), '"line1\r\nline2"');
  });

  it('quotes values with significant leading or trailing spaces', () => {
    assert.equal(toCsvField(' GB'), '" GB"');
    assert.equal(toCsvField('GB '), '"GB "');
  });

  it('does not let a value break out into extra columns', () => {
    const row = toCsvRow(['a,b', 'c']);
    assert.equal(row, '"a,b",c');
    assert.equal(row.split('","').length, 1);
  });
});

describe('toCsv', () => {
  it('writes a header plus rows with CRLF endings and a trailing newline', () => {
    const csv = toCsv(['a', 'b'], [[1, 2], [3, 4]]);
    assert.equal(csv, 'a,b\r\n1,2\r\n3,4\r\n');
  });

  it('writes a header-only file when there are no rows', () => {
    assert.equal(toCsv(['a', 'b'], []), 'a,b\r\n');
  });

  it('prepends a UTF-8 BOM only when asked', () => {
    assert.equal(toCsv(['a'], [], { withBom: true }).charCodeAt(0), 0xfeff);
    assert.notEqual(toCsv(['a'], []).charCodeAt(0), 0xfeff);
  });

  it('keeps column counts stable for ragged input', () => {
    const csv = toCsv(['a', 'b', 'c'], [['x', '', '']]);
    assert.equal(csv, 'a,b,c\r\nx,,\r\n');
  });
});

describe('csvTimestamp', () => {
  it('formats a filename-safe UTC stamp', () => {
    assert.equal(csvTimestamp(new Date('2026-09-30T10:42:07Z')), '2026-09-30_1042');
  });

  it('zero-pads single-digit parts', () => {
    assert.equal(csvTimestamp(new Date('2026-01-02T03:04:00Z')), '2026-01-02_0304');
  });

  it('contains no characters that need escaping in a filename', () => {
    assert.match(csvTimestamp(new Date('2026-09-30T10:42:07Z')), /^[0-9_-]+$/);
  });
});
