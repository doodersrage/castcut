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
