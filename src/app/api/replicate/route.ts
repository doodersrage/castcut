import { NextResponse } from 'next/server';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { queueReplicateImage } from '@/lib/cloud/replicate-client';
import {
  DEFAULT_REPLICATE_I2V_MODEL,
  DEFAULT_REPLICATE_IMG2IMG_MODEL,
  DEFAULT_REPLICATE_T2V_MODEL,
  DEFAULT_REPLICATE_TXT2IMG_MODEL,
  cloudSettingsHref,
} from '@/lib/engine/capabilities';
import { inferVideoClipMode } from '@/lib/video/clip-mode';

export const runtime = 'nodejs';
export const maxDuration = 60;

type ReplicateRequestBody = {
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  img2imgModel?: string;
  i2vModel?: string;
  t2vModel?: string;
  tool?: string;
  clipMode?: 't2v' | 'i2v' | 'extend';
  replicateApiToken?: string;
  clientId?: string;
  hasInputImage?: boolean;
  inputImageFilename?: string;
  inputImageFilenames?: string[];
  params?: {
    seed?: string | number;
    width?: string | number;
    height?: string | number;
    steps?: string | number;
    cfg?: string | number;
    denoise?: string | number;
    videoFrames?: string | number;
    videoFps?: string | number;
  };
};

function toNumber(value: string | number | undefined, fallback?: number): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/replicate');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReplicateRequestBody;
    const prompt = body.prompt?.trim();
    if (!prompt) {
      return apiError('Prompt is required.', 400);
    }

    const params = body.params ?? {};
    const seedRaw = params.seed;
    const seed =
      seedRaw === undefined || seedRaw === '' || seedRaw === -1 || seedRaw === '-1'
        ? null
        : Math.trunc(toNumber(seedRaw, 0) ?? 0);

    const clipMode =
      body.tool?.trim() === 'video'
        ? inferVideoClipMode({
            clipMode: body.clipMode,
            hasInitImage: body.hasInputImage === true && Boolean(body.inputImageFilename?.trim()),
          })
        : undefined;
    const imageFilename =
      body.hasInputImage === true && clipMode !== 't2v'
        ? body.inputImageFilename?.trim()
        : undefined;
    const frames = toNumber(params.videoFrames);
    const fps = toNumber(params.videoFps, 16);
    const durationSec =
      frames && fps && fps > 0 ? Math.max(1, Math.round(frames / fps)) : undefined;
    const result = await queueReplicateImage({
      prompt,
      negativePrompt: body.negativePrompt?.trim() || undefined,
      model: body.model?.trim() || DEFAULT_REPLICATE_TXT2IMG_MODEL,
      img2imgModel: body.img2imgModel?.trim() || DEFAULT_REPLICATE_IMG2IMG_MODEL,
      i2vModel: body.i2vModel?.trim() || DEFAULT_REPLICATE_I2V_MODEL,
      t2vModel: body.t2vModel?.trim() || DEFAULT_REPLICATE_T2V_MODEL,
      tool: body.tool?.trim() || undefined,
      clipMode,
      durationSec,
      apiToken: body.replicateApiToken,
      width: toNumber(params.width, 1024),
      height: toNumber(params.height, 1024),
      steps: toNumber(params.steps),
      cfg: toNumber(params.cfg),
      seed,
      strength: toNumber(params.denoise),
      imageFilename,
      imageFilenames: Array.isArray(body.inputImageFilenames)
        ? body.inputImageFilenames
        : undefined,
    });

    if (!result.ok || !result.promptId) {
      const missingKey = /replicate api token/i.test(result.error ?? '');
      return apiError(result.error ?? 'Replicate queue failed.', result.status || 502, {
        engineId: 'replicate',
        engineUrl: result.engineUrl,
        href: missingKey ? cloudSettingsHref() : undefined,
      });
    }

    return apiJson({
      ok: true,
      promptId: result.promptId,
      clientId: body.clientId?.trim() || undefined,
      engineId: 'replicate',
      engineUrl: result.engineUrl,
      comfyUrl: result.engineUrl,
      workflowSource: 'replicate',
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Replicate queue failed.', 502);
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
