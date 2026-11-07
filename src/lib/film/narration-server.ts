/**
 * Server: read a line — the voice engine in a kept voice when it's running, else LTX-2.5
 * audio-only (film-narration.ts) — and its view URL. A line said in a scene (Cut's read lines)
 * is acted and sounds like the scene (scene-line-sound.ts), and comes back with its length;
 * narration over a shot stays a voice-over.
 */

import { uploadComfyInputContent } from '../comfyui/comfy-input-upload-server';
import {
  comfyBaseUrl,
  resolveComfyNode,
  runComfyUtilityGraph,
  type ComfyImageRef,
} from '../comfyui/comfy-utility-graph-server';
import { sceneLineSound } from '../audio/scene-line-sound';
import {
  forgetVoiceEngineHealth,
  readLineWithVoiceEngine,
  voiceEngineReady,
} from '../audio/voice-engine-server';
import {
  buildNarrationGraph,
  NARRATION_REQUIRED_NODES,
  NARRATION_SAVE_NODE,
  normalizeNarration,
} from './narration';

/**
 * Read in front of a scene line's delivery: an actor talking to someone, not a narrator — chosen
 * by ear over the delivery alone, which still sounded like an audiobook (2026-11-07).
 */
export const SCENE_LINE_FRAME =
  'An actor in a TV drama, speaking naturally to someone in the room, not narrating or reading aloud: ';

/** How a scene line is said, framed as acting (a delivery, or natural conversation). */
export function sceneLineInstruct(delivery: string | undefined): string {
  return `${SCENE_LINE_FRAME}${delivery?.trim() || 'natural and conversational'}`;
}

export async function renderNarration(input: {
  line: string;
  speaker?: 'woman' | 'man';
  voiceSample?: string;
  /** The sample is Cut's base voice: without the voice engine, read on the seed alone. */
  voiceBase?: boolean;
  /** How the line is said (line-delivery.ts). */
  delivery?: string;
  /** A line said in a scene (Cut's read lines): acted, with the scene's sound. */
  inScene?: boolean;
  /** One speaker's lines on one seed sound like one person (a new seed is a new voice). */
  seed?: number;
  comfyUrl?: string;
}): Promise<{ url: string; seconds?: number }> {
  const line = normalizeNarration(input.line);
  if (!line) throw new Error('Write the narration line first.');
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const delivery = input.inScene ? sceneLineInstruct(input.delivery) : input.delivery;
  // A kept voice: the voice engine reads in it when it's running (seconds a line, voice-engine-
  // server.ts) — else LTX, as below.
  // It exits when idle: a line that meets it going is tried once more after it's started again.
  for (let attempt = 0; attempt < 2 && input.voiceSample && (await voiceEngineReady()); attempt++) {
    try {
      const read = await readLineWithVoiceEngine({
        line,
        voiceSample: input.voiceSample,
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
        ...(delivery ? { delivery } : {}),
        ...(input.inScene ? { shape: sceneLineSound } : {}),
        baseUrl,
      });
      return { url: read.url, ...(read.lineSeconds ? { seconds: read.lineSeconds } : {}) };
    } catch (error) {
      forgetVoiceEngineHealth();
      console.warn('[narration] voice engine failed:', error);
    }
  }
  const voiceSample = input.voiceBase ? undefined : input.voiceSample;
  for (const node of NARRATION_REQUIRED_NODES) {
    if (!(await resolveComfyNode(baseUrl, [node]))) {
      throw new Error(
        'Narration needs the ComfyUI-LTXVideo nodes (LTXV Audio Only) — update that node pack.'
      );
    }
  }
  const run = await runComfyUtilityGraph<ComfyImageRef>({
    baseUrl,
    label: 'film-narration',
    timeoutMs: 180_000,
    prompt: buildNarrationGraph({
      line,
      speaker: input.speaker === 'man' ? 'man' : 'woman',
      seed: input.seed ?? Math.floor(Math.random() * 1_000_000_000),
      ...(input.delivery ? { delivery: input.delivery } : {}),
      prefix: 'audio/Castcut-narration',
      ...(voiceSample ? { voiceSample } : {}),
    }),
    read: entry => {
      const out = (entry.outputs?.[NARRATION_SAVE_NODE] as { audio?: ComfyImageRef[] } | undefined)
        ?.audio?.[0];
      return out?.filename ? out : undefined;
    },
  });
  const track = run.result;
  if (!track) throw new Error('The narration finished without audio — check the ComfyUI log.');
  const params = new URLSearchParams({
    filename: track.filename,
    subfolder: track.subfolder ?? '',
    type: track.type || 'output',
  });
  if (input.inScene) {
    // LTX's read, given the scene's sound too and kept beside the engine's lines.
    const response = await fetch(`${baseUrl}/view?${params.toString()}`);
    if (response.ok) {
      const shaped = await sceneLineSound(new Uint8Array(await response.arrayBuffer()));
      const uploaded = await uploadComfyInputContent({
        baseUrl,
        bytes: shaped.bytes,
        filename: 'castcut-line.wav',
        mimeType: 'audio/wav',
        keepCopy: true,
      });
      const view = new URLSearchParams({
        filename: uploaded.name,
        subfolder: uploaded.subfolder,
        type: uploaded.type || 'input',
      });
      return {
        url: `/api/comfyui/view?${view.toString()}`,
        ...(shaped.seconds ? { seconds: shaped.seconds } : {}),
      };
    }
  }
  return { url: `/api/comfyui/view?${params.toString()}` };
}
