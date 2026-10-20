import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseRangeHeader } from './http-range';

describe('parseRangeHeader', () => {
  it('parses a start-end range', () => {
    assert.deepEqual(parseRangeHeader('bytes=0-499', 1000), { start: 0, end: 499 });
    assert.deepEqual(parseRangeHeader('bytes=500-999', 1000), { start: 500, end: 999 });
  });

  it('parses an open-ended range (start to EOF)', () => {
    assert.deepEqual(parseRangeHeader('bytes=900-', 1000), { start: 900, end: 999 });
  });

  it('parses a suffix range (last N bytes)', () => {
    assert.deepEqual(parseRangeHeader('bytes=-500', 1000), { start: 500, end: 999 });
  });

  it('clamps an end beyond the file size to the last byte', () => {
    assert.deepEqual(parseRangeHeader('bytes=0-999999', 1000), { start: 0, end: 999 });
  });

  it('clamps an oversized suffix length to the whole file', () => {
    assert.deepEqual(parseRangeHeader('bytes=-999999', 1000), { start: 0, end: 999 });
  });

  it('returns null for a missing or empty header', () => {
    assert.equal(parseRangeHeader(null, 1000), null);
    assert.equal(parseRangeHeader(undefined, 1000), null);
    assert.equal(parseRangeHeader('', 1000), null);
  });

  it('returns null for malformed or non-bytes ranges', () => {
    assert.equal(parseRangeHeader('bytes=', 1000), null);
    assert.equal(parseRangeHeader('bytes=abc-def', 1000), null);
    assert.equal(parseRangeHeader('items=0-10', 1000), null);
    assert.equal(parseRangeHeader('bytes=0-10,20-30', 1000), null);
  });

  it('returns null for an unsatisfiable range (start at or past EOF)', () => {
    assert.equal(parseRangeHeader('bytes=1000-1010', 1000), null);
    assert.equal(parseRangeHeader('bytes=5000-', 1000), null);
  });

  it('returns null for a zero or negative size', () => {
    assert.equal(parseRangeHeader('bytes=0-10', 0), null);
  });
});
