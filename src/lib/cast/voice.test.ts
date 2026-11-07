import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resetBrowserStorageCache } from '../storage/browser-storage';
import { createBlankCharacter, getCharacter, upsertCharacter, type CastVoice } from '../character/os';
import {
  castConversationVoiceFields,
  castPartnerExtendFields,
  castVoiceExtendFields,
  castVoiceIsBase,
  castVoiceSampleFor,
  ensureCastVoiceClip,
  shiftCastVoice,
} from './voice';

/** A browser with one Cast member (`voice` kept) and /api/cast-voice answered by `reply`. */
async function withCast(
  voice: CastVoice,
  reply: (body: Record<string, unknown>) => Record<string, unknown>,
  run: (calls: Array<Record<string, unknown>>) => Promise<void>
): Promise<void> {
  const storage = new Map<string, string>();
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const calls: Array<Record<string, unknown>> = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      dispatchEvent: () => true,
    },
  });
  globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}') as Record<string, unknown>;
    calls.push(body);
    return new Response(JSON.stringify(reply(body)), { status: 200 });
  }) as typeof fetch;
  try {
    upsertCharacter({ ...createBlankCharacter('Lisa'), id: 'cast-lisa', voice });
    await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    resetBrowserStorageCache();
  }
}

const kept: CastVoice = { sample: 'voice.wav', clip: 'voice-clip.mp4', at: 1 };

describe('a kept voice clip’s words', () => {
  it('go with the clip to a talking clip and to a longer one', async () => {
    await withCast({ ...kept, clipWords: 'This is what I sound like.' }, () => ({}), async () => {
      assert.deepEqual(castVoiceSampleFor('cast-lisa'), {
        videoVoiceSample: 'voice.wav',
        videoVoiceClip: 'voice-clip.mp4',
        videoVoiceClipWords: 'This is what I sound like.',
      });
      assert.deepEqual(castVoiceExtendFields('cast-lisa'), {
        voiceClip: 'voice-clip.mp4',
        voiceClipWords: 'This is what I sound like.',
      });
    });
    // A recorded voice has no clip: its sample alone.
    await withCast({ sample: 'mine.wav', at: 1 }, () => ({}), async () => {
      assert.deepEqual(castVoiceExtendFields('cast-lisa'), { voiceSample: 'mine.wav' });
    });
  });

  it('are heard once for a clip kept before them, and kept', async () => {
    await withCast(kept, () => ({ clipWords: 'This is what I sound like.' }), async calls => {
      assert.equal(await ensureCastVoiceClip('cast-lisa'), 'voice-clip.mp4');
      assert.deepEqual(calls, [{ clip: 'voice-clip.mp4', wordsOnly: true }]);
      assert.equal(getCharacter('cast-lisa')!.voice!.clipWords, 'This is what I sound like.');
      await ensureCastVoiceClip('cast-lisa');
      assert.equal(calls.length, 1);
    });
  });

  it('stay with a clip pitched deeper, and go with one that could not be', async () => {
    await withCast(
      { ...kept, clipWords: 'Hi.' },
      () => ({ sample: 'deeper.wav', clip: 'deeper-clip.mp4' }),
      async () => {
        assert.equal(await shiftCastVoice('cast-lisa', 'deeper'), null);
        assert.equal(getCharacter('cast-lisa')!.voice!.clip, 'deeper-clip.mp4');
        assert.equal(getCharacter('cast-lisa')!.voice!.clipWords, 'Hi.');
      }
    );
    await withCast({ ...kept, clipWords: 'Hi.' }, () => ({ sample: 'deeper.wav' }), async () => {
      await shiftCastVoice('cast-lisa', 'deeper');
      assert.equal(getCharacter('cast-lisa')!.voice!.clip, undefined);
      assert.equal(getCharacter('cast-lisa')!.voice!.clipWords, undefined);
    });
  });

  it('in a conversation, the line\'s and the reply\'s, each its own Cast member\'s', async () => {
    await withCast({ ...kept, clipWords: 'Hi, I am Lisa.' }, () => ({}), async () => {
      upsertCharacter({
        ...createBlankCharacter('Marco'),
        traits: { ...createBlankCharacter('Marco').traits, sex: 'man' },
        id: 'cast-marco',
        voice: { sample: 'm.wav', clip: 'marco-clip.mp4', clipWords: 'Hi, I am Marco.', at: 1 },
      });
      assert.deepEqual(castConversationVoiceFields('cast-lisa', 'cast-marco', ['woman', 'man']), {
        videoConversation: 'woman|man',
        videoVoiceClip: 'voice-clip.mp4',
        videoVoiceClipWords: 'Hi, I am Lisa.',
        videoPartnerVoiceClip: 'marco-clip.mp4',
        videoPartnerVoiceClipWords: 'Hi, I am Marco.',
      });
      // A longer clip's partner fields: who they are and their voice.
      assert.deepEqual(castPartnerExtendFields('cast-marco'), {
        partner: 'man',
        partnerVoiceClip: 'marco-clip.mp4',
        partnerVoiceClipWords: 'Hi, I am Marco.',
      });
      assert.deepEqual(castPartnerExtendFields('stranger'), {});
      // An invented partner (no Cast record) or the lead again: no second voice.
      assert.deepEqual(castConversationVoiceFields('cast-lisa', 'stranger', ['woman', 'man']), {
        videoConversation: 'woman|man',
        videoVoiceClip: 'voice-clip.mp4',
        videoVoiceClipWords: 'Hi, I am Lisa.',
      });
      assert.equal(
        castConversationVoiceFields('cast-lisa', 'cast-lisa', ['woman', 'other woman'])
          .videoPartnerVoiceClip,
        undefined
      );
    });
  });
});

describe('a base voice Cut gave them', () => {
  it('is marked, or cut from a read line before the mark; an audition or recording is not', () => {
    assert.equal(castVoiceIsBase({ sample: 'a.wav', base: true, at: 1 }), true);
    assert.equal(
      castVoiceIsBase({
        sample: 'a.wav',
        fromClipUrl: '/api/comfyui/view?filename=Castcut-narration_00012_.flac&subfolder=audio',
        at: 1,
      }),
      true
    );
    assert.equal(
      castVoiceIsBase({ sample: 'a.wav', fromClipUrl: '/api/comfyui/view?filename=Castcut-talk_00003_.mp4', at: 1 }),
      false
    );
    assert.equal(castVoiceIsBase({ sample: 'a.wav', fromFile: 'me.m4a', at: 1 }), false);
    assert.equal(castVoiceIsBase(null), false);
  });
});
