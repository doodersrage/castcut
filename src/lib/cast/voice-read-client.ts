'use client';

/**
 * A talking clip's line read first in the speaker's kept voice by the voice engine (Qwen3-TTS),
 * for MiniMax-H3 to say as heard (withH3VoiceAnchor's readLine). The flagship's clips each made
 * their own take on a voice from a generic sample; Cut's read lines are in the engine's voice —
 * the two did not sound like one person (2026-11-16).
 */

import { castVoiceIsBase, castVoiceOf } from './voice';
import { renderSpokenLine } from '../film/narration-client';
import { speakerSeed } from '../film/still-lines';

/** The read line as a ComfyUI input file (`subfolder/name`), from its view URL; else null. */
export function comfyInputFileOfViewUrl(url: string | undefined): string | null {
  if (!url) return null;
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);
  const name = params.get('filename')?.trim();
  if (!name || params.get('type') !== 'input') return null;
  const subfolder = params.get('subfolder')?.trim();
  return subfolder ? `${subfolder}/${name}` : name;
}

/**
 * The line in `castId`'s kept voice, as a ComfyUI input file; undefined when they have no kept
 * voice or the voice engine isn't running (the clip then anchors on the sample, as before).
 */
export async function readLineForClip(input: {
  castId: string | null | undefined;
  line: string;
  speaker: 'woman' | 'man';
  delivery?: string;
}): Promise<string | undefined> {
  const id = input.castId?.trim();
  const voice = castVoiceOf(id);
  if (!id || !voice?.sample) return undefined;
  const read = await renderSpokenLine({
    line: input.line,
    speaker: input.speaker,
    seed: speakerSeed(id),
    voiceSample: voice.sample,
    ...(castVoiceIsBase(voice) ? { voiceBase: true } : {}),
    ...(input.delivery?.trim() ? { delivery: input.delivery.trim() } : {}),
    engineOnly: true,
    // Framed as acting, as Cut's read lines are: read plain it was an audiobook voice, and H3
    // copied its cadence ("robotic at times", the flagship, 2026-11-16).
    acted: true,
  }).catch(() => null);
  return comfyInputFileOfViewUrl(read?.url) ?? undefined;
}
