import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shotProvenanceRows } from './provenance-report';

describe('shot provenance report', () => {
  it('reads each shot’s model, seed, size, LoRAs and prompt from its Gallery record', () => {
    const rows = shotProvenanceRows(
      [
        { key: 'a', title: 'Morning', kind: 'still', entryId: 'p1' },
        { key: 'b', title: 'Noon', kind: 'clip' },
      ],
      [
        {
          id: 'g1',
          promptId: 'p1',
          prompt: 'a woman pours coffee',
          tool: 'day',
          queueParams: { seed: 42, width: 1024, height: 1536, steps: 8, unetFilename: 'qwen.safetensors' },
          sessionActiveLoraIds: ['realism'],
        } as never,
      ]
    );
    assert.deepEqual(rows[0], [
      '1',
      'Morning',
      'still',
      'day',
      'qwen.safetensors',
      '42',
      '1024×1536 · 8 steps',
      'realism',
      'a woman pours coffee',
    ]);
    assert.equal(rows[1]![3], 'not in the Gallery');
  });
});
