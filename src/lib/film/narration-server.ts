/** Server: render a narration line with LTX-2.5 audio-only (film-narration.ts); its ComfyUI view URL. */

import {
  comfyBaseUrl,
  resolveComfyNode,
  runComfyUtilityGraph,
  type ComfyImageRef,
} from '../comfyui/comfy-utility-graph-server';
import {
  buildNarrationGraph,
  NARRATION_REQUIRED_NODES,
  NARRATION_SAVE_NODE,
  normalizeNarration,
} from './narration';
import {
  forgetVoiceEngineHealth,
  readLineWithVoiceEngine,
  voiceEngineReady,
} from '../audio/voice-engine-server';

export async function renderNarration(input: {
  line: string;
  speaker?: 'woman' | 'man';
  voiceSample?: string;
  /** The sample is Cut's base voice: without the voice engine, read on the seed alone. */
  voiceBase?: boolean;
  /** One speaker's lines on one seed sound like one person (a new seed is a new voice). */
  seed?: number;
  comfyUrl?: string;
}): Promise<{ url: string }> {
  const line = normalizeNarration(input.line);
  if (!line) throw new Error('Write the narration line first.');
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  // A kept voice: the voice engine reads in it when it's running (seconds a line, voice-engine-
  // server.ts) — else LTX, as below.
  // It exits when idle: a line that meets it going is tried once more after it's started again.
  for (let attempt = 0; attempt < 2 && input.voiceSample && (await voiceEngineReady()); attempt++) {
    try {
      const read = await readLineWithVoiceEngine({
        line,
        voiceSample: input.voiceSample,
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
        baseUrl,
      });
      return { url: read.url };
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
  return { url: `/api/comfyui/view?${params.toString()}` };
}
