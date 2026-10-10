/**
 * A Cast member's voice for talking clips. LTX-2.5 invents a voice per clip (live 2026-10-09:
 * speaker similarity ~0.78 between clips, a different-sounding woman each time); a ~5 s sample of
 * one clip, fed back through LTXVReferenceAudio + the ID-LoRA, pulls later clips toward it.
 */

import { getCharacter, upsertCharacter, type CastVoice } from './character-os';

/** ID-LoRA was trained on ~5 s references; longer or shorter ones transfer worse. */
export const CAST_VOICE_SAMPLE_SEC = 5;

export function castVoiceOf(castId: string | null | undefined): CastVoice | null {
  const id = castId?.trim();
  const voice = id ? getCharacter(id)?.voice : undefined;
  return voice?.sample?.trim() ? voice : null;
}

/** Queue params for a talking clip: the Cast's voice sample, when they have one. */
export function castVoiceSampleFor(castId: string | null | undefined): {
  videoVoiceSample?: string;
} {
  const voice = castVoiceOf(castId);
  return voice ? { videoVoiceSample: voice.sample } : {};
}

export function saveCastVoice(castId: string, voice: CastVoice | null): boolean {
  const character = getCharacter(castId.trim());
  if (!character) return false;
  if (voice) {
    upsertCharacter({ ...character, voice });
  } else {
    const { voice: _dropped, ...rest } = character;
    void _dropped;
    upsertCharacter(rest);
  }
  return true;
}

/**
 * "Use this voice": cut a sample from a talking clip (server, /api/cast-voice) into ComfyUI's
 * input folder and keep it on the Cast. Returns an error message, or null when it worked.
 */
export async function takeCastVoiceFromClip(input: {
  castId: string;
  clipUrl: string;
  comfyUrl?: string;
}): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch('/api/cast-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clipUrl: input.clipUrl,
        ...(input.comfyUrl ? { comfyUrl: input.comfyUrl } : {}),
      }),
    });
  } catch {
    return 'Could not reach the server.';
  }
  const data = (await response.json().catch(() => ({}))) as { sample?: string; error?: string };
  if (!response.ok || !data.sample) return data.error || 'Could not take a voice from that clip.';
  const saved = saveCastVoice(input.castId, {
    sample: data.sample,
    fromClipUrl: input.clipUrl,
    at: Date.now(),
  });
  return saved ? null : 'That Cast member is gone — pick them again.';
}

/**
 * Voice auditions: four kinds of voice to hear the Cast in before keeping one. Live (Nora,
 * 2026-10-09): 200 / 260 / 188 Hz for the first three; "husky, relaxed" came out the same voice
 * as "warm, low" (similarity 0.91), so the fourth asks for something further away.
 */
export const CAST_VOICE_AUDITIONS = {
  woman: [
    'a warm, low voice',
    'a bright, clear voice',
    'a soft, breathy voice',
    'a quick, playful voice',
  ],
  man: [
    'a deep, calm voice',
    'a light, friendly voice',
    'a gravelly, rough voice',
    'a smooth, warm voice',
  ],
} as const;

export const CAST_VOICE_AUDITION_COUNT = 4;

/** The audition clip's prompt: they introduce themselves, in that kind of voice. */
export function castVoiceAuditionPrompt(input: {
  name: string;
  lead: 'woman' | 'man';
  index: number;
}): string {
  const voices = CAST_VOICE_AUDITIONS[input.lead];
  const voice = voices[input.index % voices.length]!;
  const subject = input.lead === 'man' ? 'The man' : 'The woman';
  const name = input.name.replace(/["“”]/g, '').trim() || (input.lead === 'man' ? 'Sam' : 'Nora');
  return `${subject} looks into the camera, smiles and says clearly in ${voice}, "Hi, I'm ${name}. This is what I sound like." Quiet room, head and shoulders, natural light.`;
}

/** Ask the server to render one audition (≈45 s on LTX-2.5). Rejects with its message. */
export async function requestCastVoiceAudition(input: {
  plateUrl: string;
  name: string;
  lead: 'woman' | 'man';
  index: number;
}): Promise<string> {
  const response = await fetch('/api/cast-voice/audition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(input),
  });
  const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!response.ok || !data.url) throw new Error(data.error ?? 'The audition did not render.');
  return data.url;
}

/** Make the kept voice a little deeper or higher (server, ffmpeg) and keep the result. */
export async function shiftCastVoice(
  castId: string,
  direction: 'deeper' | 'higher'
): Promise<string | null> {
  const voice = castVoiceOf(castId);
  if (!voice) return 'Keep a voice first.';
  const response = await fetch('/api/cast-voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ sample: voice.sample, shift: direction }),
  });
  const data = (await response.json().catch(() => ({}))) as { sample?: string; error?: string };
  if (!response.ok || !data.sample) return data.error || 'Could not change the voice.';
  saveCastVoice(castId, { ...voice, sample: data.sample, at: Date.now() });
  return null;
}
