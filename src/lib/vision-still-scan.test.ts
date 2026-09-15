import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeStillScanPurpose, parseStillScan } from './vision-still-scan';

describe('vision still scan', () => {
  it('parses a fenced JSON prompt', () => {
    const scanned = parseStillScan(
      '```json\n{"prompt":"Keep the cyclist. Replace the jacket with a wet-weather shell."}\n```'
    );
    assert.match(scanned.prompt, /wet-weather shell/i);
  });

  it('falls back to prose when the vision scan is not JSON', () => {
    const scanned = parseStillScan('A rider crests a foggy hill, visor down, muddy kit.');
    assert.match(scanned.prompt, /rider/i);
  });

  it('normalizes known purposes and rejects unknown', () => {
    assert.equal(normalizeStillScanPurpose('Inpaint'), 'inpaint');
    assert.equal(normalizeStillScanPurpose('roleplay-photo'), 'roleplay-photo');
    assert.equal(normalizeStillScanPurpose('fitting-garment'), 'fitting-garment');
    assert.equal(normalizeStillScanPurpose('video'), null);
  });
});
