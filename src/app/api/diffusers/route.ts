import { getDiffusersBaseUrl, queueDiffusersTxt2Img } from '@/lib/engine/diffusers-client';
import { resolveDiffusersModelHint } from '@/lib/engine/diffusers-defaults';
import { resolveDiffusersOutputPost } from '@/lib/engine/diffusers-output-post';
import { freeComfyUiMemoryServer } from '@/lib/comfyui/free-server';
import { normalizeQueueQualityProfile } from '@/lib/queue/quality-profile';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 90;

type DiffusersRequestBody = {
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  clientId?: string;
  engineUrl?: string;
  /** When false, do not spawn a local Diffusers process. */
  autoStart?: boolean;
  /** null = auto; true/false force workshop hand crop. */
  workshopCrop?: boolean | null;
  /** Studio model id → weight filename overrides from Settings. */
  modelCheckpointMap?: Record<string, string>;
  /** Queue quality profile — Final/Max enable Comfy-parity Lanczos post. */
  qualityProfile?: string;
  /** True when this job has a reference / input image (Edit Lightning gates). */
  hasInputImage?: boolean;
  params?: {
    seed?: string | number;
    width?: string | number;
    height?: string | number;
    steps?: string | number;
    cfg?: string | number;
  };
};

function toNumber(value: string | number | undefined, fallback: number): number {
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
  return apiMethodNotAllowed(['POST'], '/api/diffusers');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DiffusersRequestBody;
    const prompt = body.prompt?.trim();
    if (!prompt) {
      return apiError('Prompt is required.', 400);
    }

    const engineUrlHint = body.engineUrl?.trim();
    try {
      // Validate early so client gets a clear 400.
      getDiffusersBaseUrl(engineUrlHint);
    } catch (error) {
      return apiError(error instanceof Error ? error.message : 'Invalid Diffusers URL.', 400);
    }

    const params = body.params ?? {};
    const seedRaw = params.seed;
    const seed =
      seedRaw === undefined || seedRaw === '' || seedRaw === -1 || seedRaw === '-1'
        ? null
        : Math.trunc(toNumber(seedRaw, 0));

    // Diffusers-first defaults lean Qwen/Flux; keep caller steps/CFG when present.
    const width = Math.max(64, Math.min(2048, Math.trunc(toNumber(params.width, 1024))));
    const height = Math.max(64, Math.min(2048, Math.trunc(toNumber(params.height, 1024))));
    const steps = Math.max(1, Math.min(150, Math.trunc(toNumber(params.steps, 28))));
    let guidance = toNumber(params.cfg, 2.5);
    if (guidance < 0) {
      guidance = 2.5;
    }

    const studioModel = body.model?.trim() || undefined;
    const model = resolveDiffusersModelHint(body.model, body.modelCheckpointMap);
    const workshopCrop =
      body.workshopCrop === true || body.workshopCrop === false ? body.workshopCrop : null;
    const qualityProfile = normalizeQueueQualityProfile(body.qualityProfile);
    const outputPost = resolveDiffusersOutputPost({
      qualityProfile,
      studioModel,
      hasInputImage: body.hasInputImage === true,
    });

    const { ensureDiffusersRunning } = await import('@/lib/engine/diffusers-autostart');
    const ensured = await ensureDiffusersRunning({
      engineUrl: engineUrlHint,
      autoStart: body.autoStart !== false,
    });
    if (!ensured.ok) {
      return apiError(ensured.error ?? 'Diffusers engine unavailable.', 503, {
        engineUrl: ensured.url,
        started: ensured.started,
      });
    }

    // Park Comfy before Diffusers claims the GPU (shared 24GB card).
    await freeComfyUiMemoryServer();

    const result = await queueDiffusersTxt2Img(
      {
        prompt,
        negative_prompt: body.negativePrompt?.trim() || '',
        model,
        width,
        height,
        steps,
        guidance_scale: guidance,
        seed,
        client_id: body.clientId?.trim() || undefined,
        workshop_crop: workshopCrop,
        studio_model: studioModel,
        quality_profile: qualityProfile,
        ...(outputPost
          ? {
              output_upscale_scale: outputPost.scale,
              output_upscale_method: outputPost.method,
              output_moire_blur_sigma: outputPost.moireBlurSigma,
              output_moire_downscale: outputPost.moireDownscale,
            }
          : {}),
      },
      engineUrlHint
    );

    if (!result.ok || !result.promptId) {
      return apiError(result.error ?? 'Diffusers queue failed.', result.status || 502, {
        engineUrl: result.engineUrl,
      });
    }

    return apiJson({
      promptId: result.promptId,
      engineUrl: result.engineUrl,
      comfyUrl: result.engineUrl,
      clientId: body.clientId?.trim() || undefined,
      workflowSource: 'diffusers',
      model,
      studioModel,
      qualityProfile,
      outputUpscaleScale: outputPost?.scale ?? 1,
      outputUpscaleMethod: outputPost?.method ?? null,
      outputMoireBlurSigma: outputPost?.moireBlurSigma ?? 0,
      outputMoireDownscale: outputPost?.moireDownscale ?? 1,
      steps,
      guidanceScale: guidance,
      width,
      height,
      seed,
      workshopCrop,
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Diffusers queue failed.', 502);
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
