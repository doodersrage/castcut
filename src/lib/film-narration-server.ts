/** Server: render a narration line with LTX-2.5 audio-only (film-narration.ts); its ComfyUI view URL. */

import {
  comfyBaseUrl,
  resolveComfyNode,
  runComfyUtilityGraph,
  type ComfyImageRef,
} from './comfy-utility-graph-server';
import {
  buildNarrationGraph,
  NARRATION_REQUIRED_NODES,
  NARRATION_SAVE_NODE,
  normalizeNarration,
} from './film-narration';

export async function renderNarration(input: {
  line: string;
  speaker?: 'woman' | 'man';
  voiceSample?: string;
  comfyUrl?: string;
}): Promise<{ url: string }> {
  const line = normalizeNarration(input.line);
  if (!line) throw new Error('Write the narration line first.');
  const baseUrl = comfyBaseUrl(input.comfyUrl);
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
      seed: Math.floor(Math.random() * 1_000_000_000),
      prefix: 'audio/Castcut-narration',
      ...(input.voiceSample ? { voiceSample: input.voiceSample } : {}),
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
