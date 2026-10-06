/**
 * Server-only: probe ComfyUI (object_info) and the local ffmpeg for Play's optional checks.
 */

import { isLlmEnabled } from '@/lib/llm-client';
import { detectVisionModel } from '@/lib/vision-model-auto';
import { detectLmStudio } from '@/lib/vision-model-download-server';
import { comfyBaseUrl, resolveComfyNode } from '@/lib/comfy-utility-graph-server';
import {
  ffmpegHasDrawtext,
  resolveFfmpegBinary,
  resolveFilmFontFile,
} from '@/lib/film-server-encode';
import { parseComfyUiSystemStats } from '@/lib/castcut-nodes-setup';
import { buildPlayChecksReadiness, type PlayChecksReadiness } from '@/lib/play-checks-readiness';

async function comfyReachable(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/system_stats`, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function probePlayChecksReadiness(
  comfyUrl?: string,
  options?: { sessionVisionModel?: string }
): Promise<PlayChecksReadiness> {
  const baseUrl = comfyBaseUrl(comfyUrl);
  const reachable = await comfyReachable(baseUrl);
  const [pose, models, distance, previewAny] = reachable
    ? await Promise.all([
        resolveComfyNode(baseUrl, ['DWPreprocessor', 'OpenposePreprocessor'], { fresh: true }),
        resolveComfyNode(baseUrl, ['FaceAnalysisModels'], { fresh: true }),
        resolveComfyNode(baseUrl, ['FaceEmbedDistance'], { fresh: true }),
        resolveComfyNode(baseUrl, ['PreviewAny'], { fresh: true }),
      ])
    : [null, null, null, null];
  const [installedPacks, system] = reachable
    ? await Promise.all([readInstalledPacks(baseUrl), readSystem(baseUrl)])
    : [null, null];
  const ffmpeg = await resolveFfmpegBinary();
  const drawtext = ffmpeg ? await ffmpegHasDrawtext(ffmpeg) : false;
  const font = drawtext ? Boolean(await resolveFilmFontFile()) : false;
  const sessionVision = options?.sessionVisionModel?.trim();
  const envVision = process.env.LLM_VISION_MODEL?.trim();
  const llmEnabled = isLlmEnabled();
  const detected =
    llmEnabled && !sessionVision && !envVision ? await detectVisionModel() : undefined;
  const model = sessionVision || envVision || detected;
  const vision = {
    llmEnabled,
    model,
    lmStudio: llmEnabled && !model ? Boolean(await detectLmStudio()) : false,
    source: sessionVision
      ? ('session' as const)
      : envVision
        ? ('env' as const)
        : detected
          ? ('detected' as const)
          : undefined,
  };
  return buildPlayChecksReadiness({
    comfyReachable: reachable,
    poseNode: pose?.node ?? null,
    faceNodes: {
      models: Boolean(models),
      distance: Boolean(distance),
      previewAny: Boolean(previewAny),
    },
    ffmpeg: { available: Boolean(ffmpeg), drawtext, font },
    vision,
    installedPacks,
    system,
  });
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/**
 * Packs ComfyUI-Manager lists as installed and enabled, to tell "not installed" from "installed
 * but its nodes did not load" (ComfyUI_FaceAnalysis without InsightFace). Null without a Manager.
 */
export function installedCheckPacks(
  payload: unknown
): { faceAnalysis: boolean; controlnetAux: boolean } | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const enabled = new Set<string>();
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const entry = (value ?? {}) as { enabled?: unknown; cnr_id?: unknown; aux_id?: unknown };
    if (entry.enabled === false) continue;
    for (const name of [key, entry.cnr_id, entry.aux_id]) {
      if (typeof name === 'string' && name) enabled.add(name.toLowerCase().split('/').pop()!);
    }
  }
  return {
    faceAnalysis: enabled.has('comfyui_faceanalysis'),
    controlnetAux: enabled.has('comfyui_controlnet_aux'),
  };
}

async function readInstalledPacks(baseUrl: string) {
  const payload =
    (await getJson(`${baseUrl}/api/customnode/installed`)) ??
    (await getJson(`${baseUrl}/customnode/installed`));
  return installedCheckPacks(payload);
}

async function readSystem(baseUrl: string) {
  const info = parseComfyUiSystemStats(await getJson(`${baseUrl}/system_stats`));
  return info ? { os: info.os, embeddedPython: info.embeddedPython } : null;
}
