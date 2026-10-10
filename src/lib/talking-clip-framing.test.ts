import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { talkingClipCropRect } from './talking-clip-framing';

describe('talking clip framing', () => {
  it('crops a full-body still chest-up around the face, 3:4, face in the upper third', () => {
    // The user's night still: 1104×1472, face ~120 px brow to chin near the top right.
    const rect = talkingClipCropRect(1104, 1472, { x: 730, y: 210, width: 110, height: 120 })!;
    assert.equal(rect.height, 504);
    assert.equal(rect.width, 378);
    assert.ok(rect.x <= 730 && rect.x + rect.width >= 840, 'face inside');
    assert.ok(210 - rect.y < rect.height / 3, 'face in the upper third');
  });

  it('leaves a still whose face is already large alone', () => {
    assert.equal(talkingClipCropRect(960, 1280, { x: 400, y: 200, width: 200, height: 260 }), null);
  });

  it('stays inside the image near an edge', () => {
    const rect = talkingClipCropRect(800, 1000, { x: 760, y: 10, width: 40, height: 50 })!;
    assert.ok(rect.x >= 0 && rect.x + rect.width <= 800 && rect.y >= 0);
  });
});

describe('talking clip prompt', async () => {
  const { talkingClipPrompt } = await import('./ltx25-renderer');
  it('holds her facing the camera while she says the line (no beat motion, no closed-mouth rule)', () => {
    const prompt = talkingClipPrompt({ setting: 'office building entrance', line: '"Finally. Friday."' });
    assert.match(prompt, /She stops where she is, looks into the camera and says clearly, "Finally\. Friday\."/);
    assert.match(prompt, /does not walk away or turn around/);
    assert.doesNotMatch(prompt, /mid-stride|wide-open mouth/);
    assert.match(talkingClipPrompt({ line: 'Hi there', speaker: 'He' }), /He stops where he is.*His lips move/);
  });
});

describe('keep the full frame', async () => {
  const { normalizeDaySlots } = await import('./day-planner');
  it('is kept on a Day slot only when set', () => {
    const [on, off] = normalizeDaySlots([
      { id: 'morning', label: 'Morning', line: 'Hi there', lineFullFrame: true },
      { id: 'evening', label: 'Evening', line: 'Hi there', lineFullFrame: false },
    ] as never);
    assert.equal(on!.lineFullFrame, true);
    assert.equal('lineFullFrame' in off!, false);
  });
});

describe('one-shot conversation', async () => {
  const { conversationClipPrompt, conversationPartnerNoun } = await import('./ltx25-renderer');
  const { buildSpokenLineMessages } = await import('./spoken-line');
  it('names who says what, in order, and keeps them in place', () => {
    const prompt = conversationClipPrompt({ line: 'You made coffee?', reply: 'Only because you were snoring.', lead: 'woman', partner: 'man' });
    assert.match(prompt, /The woman turns to the man and says, "You made coffee\?" The man answers, "Only because you were snoring\."/);
    assert.match(prompt, /they stay in place/);
    assert.match(
      conversationClipPrompt({ line: 'Hi', reply: 'Hey', lead: 'woman', partner: 'woman' }),
      /One woman turns to the other woman.*The other woman answers/
    );
  });
  it('reads the other person from the still, else the opposite of the lead', () => {
    assert.equal(conversationPartnerNoun('… her girlfriend has her own face …', 'woman'), 'woman');
    assert.equal(conversationPartnerNoun('a couple at the counter', 'woman'), 'man');
    assert.equal(conversationPartnerNoun('his boyfriend has the face from Image 2', 'man'), 'man');
  });
  it('a reply suggestion answers the line', () => {
    const [system] = buildSpokenLineMessages({ scene: 'kitchen', replyTo: 'You made coffee?' });
    assert.match(system!.content, /other person in the scene could say back to her, answering: "You made coffee\?"/);
  });
});

describe('how the line is said', async () => {
  const { talkingClipPrompt, conversationClipPrompt, extendSegmentPrompt, normalizeSpokenLineTone, spokenLineVerb } =
    await import('./ltx25-renderer');
  it('natural (or no tone) keeps "says clearly"', () => {
    assert.match(talkingClipPrompt({ line: 'Hi', tone: 'natural' }), /looks into the camera and says clearly, "Hi"/);
    assert.match(talkingClipPrompt({ line: 'Hi' }), /says clearly, "Hi"/);
  });
  it('a tone swaps the speech verb, with the speaker’s pronoun', () => {
    assert.match(talkingClipPrompt({ line: 'Hi', tone: 'whisper' }), /looks into the camera and leans in and whispers, in a soft breathy whisper, "Hi"/);
    assert.match(talkingClipPrompt({ line: 'Hi', tone: 'angry', speaker: 'He' }), /snaps angrily, his voice sharp and raised, "Hi"/);
    assert.equal(spokenLineVerb('laughing', 'She'), 'laughs and says through her laughter,');
  });
  it('reaches conversations and 30-second parts', () => {
    assert.match(
      conversationClipPrompt({ line: 'Coffee?', reply: 'Yes.', tone: 'teasing' }),
      /The woman turns to the man and says in a playful, teasing tone with a little smirk, "Coffee\?"/
    );
    assert.match(conversationClipPrompt({ line: 'Coffee?', reply: 'Yes.' }), /turns to the man and says, "Coffee\?"/);
    assert.match(
      extendSegmentPrompt('She waves.', undefined, { line: 'Bye!', tone: 'excited' }),
      /As she does, she says excitedly, her voice bright, loud and fast, "Bye!"/
    );
  });
  it('stores only known, non-natural tones', () => {
    assert.equal(normalizeSpokenLineTone('tender'), 'tender');
    assert.equal(normalizeSpokenLineTone('natural'), undefined);
    assert.equal(normalizeSpokenLineTone('sarcastic'), undefined);
    assert.equal(normalizeSpokenLineTone(3), undefined);
  });
});
