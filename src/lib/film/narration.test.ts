import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  lineSoundsCut,
  buildNarrationGraph,
  NARRATION_SAVE_NODE,
  narrationSeconds,
  normalizeNarration,
} from './narration';

describe('film narration', () => {
  it('sizes the audio to the line', () => {
    assert.equal(narrationSeconds('Hi.'), 3);
    assert.ok(narrationSeconds('Some mornings, the city feels like it was made just for me.') >= 5);
    assert.equal(narrationSeconds('word '.repeat(60)), 10);
  });
  it('strips quotes and caps the length', () => {
    assert.equal(normalizeNarration('  "Hello  there" '), 'Hello there');
    assert.equal(normalizeNarration('x'.repeat(300)).length, 140);
  });
  it('renders audio only, and steers to a kept voice through the ID-LoRA', () => {
    const plain = buildNarrationGraph({ line: 'Here we are.', speaker: 'woman', seed: 1, prefix: 'p' });
    assert.equal(plain['60']!.class_type, 'LTXVAudioOnlyModel');
    assert.equal(plain[NARRATION_SAVE_NODE]!.class_type, 'SaveAudio');
    assert.equal(plain['52'], undefined);
    assert.match(String(plain['5']!.inputs.text), /A woman .*"Here we are\."/);
    const voiced = buildNarrationGraph({
      line: 'Here we are.',
      speaker: 'man',
      seed: 1,
      prefix: 'p',
      voiceSample: 'castcut-voice-x.wav',
    });
    assert.equal(voiced['52']!.class_type, 'LTXVReferenceAudio');
    assert.deepEqual(voiced['60']!.inputs.model, ['52', 0]);
    assert.match(String(voiced['5']!.inputs.text), /^A man/);
  });
});

describe('lineSoundsCut', () => {
  it('hears a line read faster than anyone speaks as cut off', () => {
    // 12 words in 1.8 s: the voice stopped early.
    assert.equal(lineSoundsCut('You saved my espresso machine, and my pride, and I owe you one.', 1.8), true);
    // The same line at a talking pace.
    assert.equal(lineSoundsCut('You saved my espresso machine, and my pride, and I owe you one.', 4.2), false);
  });
  it('leaves short lines and unknown lengths alone', () => {
    assert.equal(lineSoundsCut('What?', 0.3), false);
    assert.equal(lineSoundsCut('Not ever, not once.', undefined), false);
  });
});
