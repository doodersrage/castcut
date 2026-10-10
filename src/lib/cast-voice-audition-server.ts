/**
 * Server: render one voice audition — the Cast's picture, introducing themselves in a given kind
 * of voice, on LTX-2.5 with sound (cast-voice.ts CAST_VOICE_AUDITIONS). Returns the MP4's ComfyUI
 * view URL; "Use this voice" then keeps a sample of it.
 */

import { castVoiceAuditionPrompt } from './cast-voice';
import { uploadComfyInputContent } from './comfy-input-upload-server';
import {
  comfyBaseUrl,
  parseComfyViewRef,
  runComfyUtilityGraph,
  stageComfyImageAsInput,
  type ComfyImageRef,
} from './comfy-utility-graph-server';
import { buildLtx25TalkingClipGraph, LTX25_SPEECH_SAVE_NODE } from './ltx25-renderer';

async function stagePlate(input: {
  baseUrl: string;
  plateUrl: string;
  requestOrigin?: string;
  userId?: string | null;
}): Promise<string> {
  const ref = input.plateUrl.includes('/api/comfyui/view')
    ? parseComfyViewRef(input.plateUrl)
    : null;
  if (ref) return stageComfyImageAsInput(input.baseUrl, ref, 'voice-audition');
  const { fetchFilmShotBytes } = await import('./video-shot-fetch');
  const fetched = await fetchFilmShotBytes({
    url: input.plateUrl,
    requestOrigin: input.requestOrigin,
    userId: input.userId,
  });
  const uploaded = await uploadComfyInputContent({
    baseUrl: input.baseUrl,
    bytes: new Uint8Array(fetched.buffer),
    filename: 'castcut-voice-audition.png',
    mimeType: fetched.contentType || 'image/png',
  });
  return uploaded.name;
}

export async function renderVoiceAudition(input: {
  plateUrl: string;
  name: string;
  lead: 'woman' | 'man';
  index: number;
  comfyUrl?: string;
  requestOrigin?: string;
  userId?: string | null;
}): Promise<string> {
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const image = await stagePlate({ ...input, baseUrl });
  const graph = buildLtx25TalkingClipGraph({
    image,
    prompt: castVoiceAuditionPrompt(input),
    // A different voice per audition: the seed moves it as much as the words do.
    seed: 7100 + input.index * 977,
    prefix: 'Castcut-voice-audition',
  });
  const run = await runComfyUtilityGraph<ComfyImageRef>({
    baseUrl,
    label: 'voice-audition',
    timeoutMs: 240_000,
    prompt: graph,
    read: entry => {
      const out = (
        entry.outputs?.[LTX25_SPEECH_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined
      )?.images?.[0];
      return out?.filename ? out : undefined;
    },
  });
  const clip = run.result;
  if (!clip) throw new Error('The audition finished without a clip — check the ComfyUI log.');
  const params = new URLSearchParams({
    filename: clip.filename,
    subfolder: clip.subfolder ?? '',
    type: clip.type || 'output',
  });
  return `/api/comfyui/view?${params.toString()}`;
}
