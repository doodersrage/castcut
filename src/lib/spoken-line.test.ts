import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSpokenLineMessages, parseSpokenLine } from './spoken-line';
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
    assert.match(system!.content, /Nora says out loud/);
    assert.match(system!.content, /Keep it clean/);
    assert.match(user!.content, /stirring a pot of soup[\s\S]*evening[\s\S]*dry humour[\s\S]*Coffee first/);
    assert.match(buildSpokenLineMessages({ scene: 'x', adult: true })[0]!.content, /never|no explicit/i);
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
