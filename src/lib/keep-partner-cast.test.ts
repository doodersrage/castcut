import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { characterFromPartnerStandIn } from './character-os';
import { resolveDayCastPlate } from './day-plate';

describe('Keep as Cast (Day partner stand-in)', () => {
  it("the stranger's face becomes the new Cast's plate, the look its descriptor", () => {
    const record = characterFromPartnerStandIn({
      look: 'a Latino man in his thirties with short curly hair',
      filename: 'day-partner-vl-abc.png',
      imageUrl: '/api/comfyui/view?filename=day-partner-vl-abc.png',
      now: 5,
    });
    assert.match(record.id, /\S/);
    assert.equal(record.name, 'Day partner');
    assert.equal(record.descriptor, 'a Latino man in his thirties with short curly hair');
    const plate = resolveDayCastPlate(record);
    assert.equal(plate?.filename, 'day-partner-vl-abc.png');
  });

  it('takes a name', () => {
    assert.equal(
      characterFromPartnerStandIn({ look: 'x', filename: 'f.png', name: ' Marco ' }).name,
      'Marco'
    );
  });
});
