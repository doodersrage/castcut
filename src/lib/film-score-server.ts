/** Server: render a film score with ACE-Step 1.5 (film-score.ts) and return its ComfyUI view URL. */

import {
  comfyBaseUrl,
  resolveComfyNode,
  runComfyUtilityGraph,
  type ComfyImageRef,
} from './comfy-utility-graph-server';
import {
  ACE_STEP_CHECKPOINT,
  ACE_STEP_REQUIRED_NODES,
  buildFilmScoreGraph,
  FILM_SCORE_SAVE_NODE,
  filmScoreSeconds,
  filmScoreStyle,
  type FilmScoreBrief,
} from './film-score';

/** Whether this ComfyUI has the ACE-Step 1.5 nodes and model (null model: could not tell). */
export async function probeFilmScore(
  baseUrl: string,
  options?: { fresh?: boolean }
): Promise<{ nodes: boolean; model: boolean | null }> {
  for (const node of ACE_STEP_REQUIRED_NODES) {
    if (!(await resolveComfyNode(baseUrl, [node], options))) return { nodes: false, model: null };
  }
  const loader = await resolveComfyNode(baseUrl, ['CheckpointLoaderSimple'], options);
  const spec = loader?.info.input?.required?.ckpt_name;
  const names = Array.isArray(spec)
    ? Array.isArray(spec[0])
      ? spec[0]
      : ((spec[1] as { options?: unknown } | undefined)?.options ?? [])
    : null;
  return {
    nodes: true,
    model: Array.isArray(names)
      ? names.some(name => String(name).split(/[\\/]/).pop() === ACE_STEP_CHECKPOINT)
      : null,
  };
}

export async function renderFilmScore(input: {
  brief: FilmScoreBrief;
  cutSeconds: number;
  comfyUrl?: string;
}): Promise<{ url: string; label: string; seconds: number }> {
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const probe = await probeFilmScore(baseUrl);
  if (!probe.nodes) {
    throw new Error('Scoring needs a newer ComfyUI (the ACE-Step 1.5 audio nodes).');
  }
  if (probe.model === false) {
    throw new Error(
      'Scoring needs the ACE-Step 1.5 model — download “ACE-Step 1.5 (film scores)” under Settings → ComfyUI → Models.'
    );
  }
  const style = filmScoreStyle(input.brief);
  const seconds = filmScoreSeconds(input.cutSeconds);
  const run = await runComfyUtilityGraph<ComfyImageRef>({
    baseUrl,
    label: 'film-score',
    timeoutMs: 240_000,
    prompt: buildFilmScoreGraph({
      ...style,
      seconds,
      seed: Math.floor(Math.random() * 1_000_000_000),
      prefix: 'audio/Castcut-score',
    }),
    read: entry => {
      const out = (entry.outputs?.[FILM_SCORE_SAVE_NODE] as { audio?: ComfyImageRef[] } | undefined)
        ?.audio?.[0];
      return out?.filename ? out : undefined;
    },
  });
  const track = run.result;
  if (!track) throw new Error('The score finished without a track — check the ComfyUI log.');
  const params = new URLSearchParams({
    filename: track.filename,
    subfolder: track.subfolder ?? '',
    type: track.type || 'output',
  });
  const genre = style.tags.split(',')[0]!.trim();
  return { url: `/api/comfyui/view?${params.toString()}`, label: `Score: ${genre}`, seconds };
}
