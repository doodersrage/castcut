import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { qwenImage21UserLoras } from './config';

describe('qwenImage21UserLoras', () => {
  it('takes only switched-on LoRAs scanned as Qwen-Image 2.1 (never by name alone)', () => {
    const entry = (id: string, tokenValue: string, extra: Record<string, unknown> = {}) => ({
      id,
      label: id,
      triggerPhrase: '',
      tokenValue,
      ...extra,
    });
    assert.deepEqual(
      qwenImage21UserLoras([
        entry('anatomy', 'qwen21_femaledvaginus_v13b.safetensors', { family: 'qwen21', familySource: 'keys', strengthModel: 0.8 }),
        entry('off', 'qwen21_glamour_realism_v1.safetensors', { family: 'qwen21', familySource: 'keys', enabled: false }),
        entry('20b', 'qwen-edit-skin.safetensors', { family: 'qwen', familySource: 'keys' }),
        entry('unscanned', 'my_qwen-image-2.1_style.safetensors'),
      ]),
      [
        { name: 'qwen21_femaledvaginus_v13b.safetensors', strength: 0.8 },
      ]
    );
    assert.deepEqual(qwenImage21UserLoras(undefined), []);
  });
});
