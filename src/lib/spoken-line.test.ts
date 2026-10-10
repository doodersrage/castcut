import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSpokenLineMessages,
  parseSpokenLine,
  pickSpokenLine,
  spokenLineHeat,
} from './spoken-line';
import { parseRoleplayScenes } from './roleplay';
import { clipUrlIsVideo } from './clip-media-kind';
import { castVoiceAuditionPrompt } from './cast-voice';
import { voiceShiftArgs } from './cast-voice-server';
import { buildLtx25TalkingClipGraph, LTX25_SPEECH_SAVE_NODE } from './ltx25-renderer';
import type { ComfyGalleryEntry } from './comfyui-gallery';

describe('suggested spoken lines', () => {
  it('keeps one short spoken line out of whatever the LLM replies', () => {
    assert.equal(parseSpokenLine('"Okay. One more email, then I\'m done."'), "Okay. One more email, then I'm done.");
    assert.equal(parseSpokenLine('Line: *sighs* Coffee first. (laughs) 😅 #mondays'), 'Coffee first.');
    assert.equal(parseSpokenLine('<think>hmm</think>\nShoes off. Finally.'), 'Shoes off. Finally.');
    assert.equal(parseSpokenLine('Hi'), '', 'one word is not a line');
    assert.equal(parseSpokenLine('word '.repeat(20)), '', 'too long to say in a clip');
  });

  it('asks for a clean line unless the mood is adult, and passes the scene and personality', () => {
    const [system, user] = buildSpokenLineMessages({
      scene: 'stirring a pot of soup',
      when: 'evening',
      name: 'Nora',
      personality: 'dry humour',
      avoid: ['Coffee first.'],
    });
    assert.match(system!.content, /FOUR different lines Nora could say out loud, to a friend filming on a phone/);
    assert.match(system!.content, /Do not describe what they are doing/);
    assert.match(system!.content, /vlog[\s\S]*Keep it clean/);
    assert.match(user!.content, /stirring a pot of soup[\s\S]*evening[\s\S]*dry humour[\s\S]*Coffee first/);
    const flirty = buildSpokenLineMessages({ scene: 'x', heat: spokenLineHeat('suggestive') })[0]!.content;
    assert.match(flirty, /flirty[\s\S]*no explicit/i);
    // Intimate / raunchy: what would really be said to a lover — never the vlog framing.
    const sensual = buildSpokenLineMessages({ scene: 'x', heat: spokenLineHeat('intimate') })[0]!.content;
    assert.match(sensual, /murmur/);
    assert.doesNotMatch(sensual, /vlog/);
    const explicit = buildSpokenLineMessages({ scene: 'x', heat: spokenLineHeat('raunchy') })[0]!.content;
    assert.match(explicit, /dirty talk[\s\S]*Explicit words are fine[\s\S]*Consenting adults only/);
    assert.equal(spokenLineHeat('sultry'), 'sensual');
    assert.equal(spokenLineHeat('explicit'), 'explicit');
    assert.equal(spokenLineHeat('everyday'), 'clean');
  });

  it("keeps the Story writer's line as a suggestion on the scene", () => {
    const [scene] = parseRoleplayScenes({
      scenes: [{ title: 'A door appears', blurb: 'She stares at a door.', line: '"Did that door just appear?"' }],
    });
    assert.equal(scene!.suggestedLine, 'Did that door just appear?');
    assert.equal(
      parseRoleplayScenes({ scenes: [{ title: 'Quiet', blurb: 'x', line: '' }] })[0]!.suggestedLine,
      undefined
    );
  });
});

describe('clips with sound in the lightbox', () => {
  const entry = (id: string, filename: string, promptId = id) =>
    ({ id, promptId, images: [{ filename }] }) as unknown as ComfyGalleryEntry;
  it('a gallery clip with no extension in its URL is a video when its file is an MP4', () => {
    const gallery = [entry('a1', 'Castcut_1.mp4', 'p1'), entry('b2', 'Castcut_2.webp', 'p2')];
    assert.equal(clipUrlIsVideo('/api/gallery/media/a1?variant=original', { gallery }), true);
    assert.equal(clipUrlIsVideo('/api/gallery/media/zz?variant=original', { gallery, promptId: 'p1' }), true);
    assert.equal(clipUrlIsVideo('/api/gallery/media/b2?variant=original', { gallery }), false);
    assert.equal(clipUrlIsVideo('/api/comfyui/view?filename=x.mp4&type=output', { gallery: [] }), true);
    assert.equal(clipUrlIsVideo('/api/gallery/media/none', { gallery: [] }), false);
  });
  it('a voiced / extended MP4 kept in the gallery is a video though its slot keeps the WebP job id', () => {
    const gallery = [entry('webp', 'Castcut_9.webp', 'wan-job'), entry('kept', 'castcut-extended-1.mp4', 'extend-kept')];
    assert.equal(clipUrlIsVideo('/api/gallery/media/kept?variant=original', { gallery, promptId: 'wan-job' }), true);
  });
});

describe('voice auditions', () => {
  it('four kinds of voice, the Cast introducing themselves', () => {
    const prompt = castVoiceAuditionPrompt({ name: 'Nora', lead: 'woman', index: 2 });
    assert.match(prompt, /^The woman looks into the camera.*a soft, breathy voice, "Hi, I'm Nora\./);
    assert.match(castVoiceAuditionPrompt({ name: 'Sam', lead: 'man', index: 0 }), /The man .* a deep, calm voice/);
  });

  it('builds a standalone talking clip graph that saves an MP4', () => {
    const graph = buildLtx25TalkingClipGraph({ image: 'plate.png', prompt: 'says "hi"', seed: 3, prefix: 'p' });
    assert.equal(graph[LTX25_SPEECH_SAVE_NODE]?.class_type, 'SaveVideo');
    assert.equal(Object.values(graph).some(node => node.class_type === 'SaveAnimatedWEBP'), false);
  });

  it('deeper / higher shift the pitch about two semitones at the same speed', () => {
    const deeper = voiceShiftArgs('/i.wav', '/o.wav', 'deeper').join(' ');
    assert.match(deeper, /asetrate=24000\*0\.89,aresample=24000,atempo=1\.1236/);
    assert.match(voiceShiftArgs('/i.wav', '/o.wav', 'higher').join(' '), /asetrate=24000\*1\.12/);
  });
});

describe('pickSpokenLine', () => {
  const scene = {
    scene: 'seated knee-to-knee with her partner at a beach bar, sharing one drink with two straws',
    setting: 'beach bar',
  };
  it('picks the candidate tied to the scene, skipping stock words and repeats', () => {
    const reply = [
      '1. That sunset? Perfect light tonight.',
      '2. The ocean is singing to us.',
      '3. Your straw is stuck again, want mine?',
      '4. Okay, one more drink and we swim.',
    ].join('\n');
    assert.equal(pickSpokenLine(reply, scene, () => 0), 'Your straw is stuck again, want mine?');
    assert.equal(
      pickSpokenLine(reply, { ...scene, avoid: ['Your straw is stuck again, want mine?'] }, () => 0),
      'Okay, one more drink and we swim.'
    );
    assert.equal(pickSpokenLine('', scene), '');
  });
  it('speaks to the partner when the scene has one', () => {
    assert.match(buildSpokenLineMessages(scene)[0]!.content, /to the other person in the scene/);
  });
});

