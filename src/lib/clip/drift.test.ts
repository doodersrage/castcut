import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseClipDrift } from './drift';

// The vision model's replies on the flagship's clips (2026-11-16).
describe('a clip that drifts from its shot, as the vision model reads it', () => {
  it('a close-up, someone gone or new, another shot: drifted, with why', () => {
    assert.deepEqual(
      parseClipDrift('{"new_people": false, "people_gone": true, "framing": "closer", "place": true}'),
      { drifted: true, reasons: ['someone leaves the shot', 'the camera moves in close'] }
    );
    assert.deepEqual(parseClipDrift('{"new_people":true,"people_gone":false,"framing":"other","place":true}'), {
      drifted: true,
      reasons: ['someone new comes in', 'it ends on a different shot'],
    });
  });

  it('the same shot is kept; a reply that is not the JSON asked for is not read', () => {
    assert.deepEqual(
      parseClipDrift('{"new_people": false, "people_gone": false, "framing": "same", "place": true}'),
      { drifted: false, reasons: [] }
    );
    assert.equal(parseClipDrift('I cannot tell.'), null);
    assert.equal(parseClipDrift(null), null);
  });
});
