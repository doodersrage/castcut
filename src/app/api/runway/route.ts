import { NextResponse } from 'next/server';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { queueRunwayImage } from '@/lib/cloud/runway-client';
import {
  DEFAULT_RUNWAY_EXTEND_MODEL,
  DEFAULT_RUNWAY_I2V_MODEL,
  DEFAULT_RUNWAY_IMG2IMG_MODEL,
  DEFAULT_RUNWAY_T2V_MODEL,
  DEFAULT_RUNWAY_TXT2IMG_MODEL,
  cloudSettingsHref,
} from '@/lib/engine/capabilities';
import { inferVideoClipMode } from '@/lib/video/clip-mode';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RunwayRequestBody = {
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  img2imgModel?: string;
  i2vModel?: string;
  t2vModel?: string;
  extendModel?: string;
  tool?: string;
  clipMode?: 't2v' | 'i2v' | 'extend';
  videoUrl?: string;
  runwayApiKey?: string;
  clientId?: string;
  hasInputImage?: boolean;
  inputImageFilename?: string;
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
  return apiMethodNotAllowed(['POST'], '/api/runway');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RunwayRequestBody;
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
    const result = await queueRunwayImage({
      prompt,
      negativePrompt: body.negativePrompt?.trim() || undefined,
      model: body.model?.trim() || DEFAULT_RUNWAY_TXT2IMG_MODEL,
      img2imgModel: body.img2imgModel?.trim() || DEFAULT_RUNWAY_IMG2IMG_MODEL,
      i2vModel: body.i2vModel?.trim() || DEFAULT_RUNWAY_I2V_MODEL,
      t2vModel: body.t2vModel?.trim() || DEFAULT_RUNWAY_T2V_MODEL,
      extendModel: body.extendModel?.trim() || DEFAULT_RUNWAY_EXTEND_MODEL,
      tool: body.tool?.trim() || undefined,
      clipMode,
      durationSec,
      videoUrl: body.videoUrl?.trim() || undefined,
      requestOrigin: new URL(request.url).origin,
      apiKey: body.runwayApiKey,
      width: toNumber(params.width, 1024),
      height: toNumber(params.height, 1024),
      seed,
      imageFilename,
    });

    if (!result.ok || !result.promptId) {
      const missingKey = /runway api key/i.test(result.error ?? '');
      return apiError(result.error ?? 'Runway queue failed.', result.status || 502, {
        engineId: 'runway',
        engineUrl: result.engineUrl,
        href: missingKey ? cloudSettingsHref() : undefined,
      });
    }

    return apiJson({
      ok: true,
      promptId: result.promptId,
      clientId: body.clientId?.trim() || undefined,
      engineId: 'runway',
      engineUrl: result.engineUrl,
      comfyUrl: result.engineUrl,
      workflowSource: 'runway',
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Runway queue failed.', 502);
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
