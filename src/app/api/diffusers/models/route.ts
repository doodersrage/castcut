import { fetchDiffusersModels, getDiffusersBaseUrl } from '@/lib/engine/diffusers-client';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const engineUrlHint =
    searchParams.get('engineUrl')?.trim() || searchParams.get('comfyUrl')?.trim() || undefined;
  const autoStart = searchParams.get('autoStart') !== '0';

  try {
    getDiffusersBaseUrl(engineUrlHint);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid Diffusers URL.', 400);
  }

  let listed = await fetchDiffusersModels(engineUrlHint);
  if (!listed && autoStart) {
    // Dynamic import keeps spawn/fs paths out of this route's static NFT graph.
    const { ensureDiffusersRunning } = await import('@/lib/engine/diffusers-autostart');
    const ensured = await ensureDiffusersRunning({
      engineUrl: engineUrlHint,
      autoStart,
    });
    if (ensured.ok) {
      listed = await fetchDiffusersModels(engineUrlHint);
    } else if (ensured.error) {
      return apiError(ensured.error, 502);
    }
  }
  if (!listed) {
    return apiError('Diffusers model list failed.', 502);
  }

  return apiJson({
    models: listed.models,
    checkpoints: listed.checkpoints,
    diffusionModels: listed.diffusionModels,
    textEncoders: listed.textEncoders,
    vaes: listed.vaes,
    loras: listed.loras,
    defaultModel: listed.defaultModel,
    searchPaths: listed.searchPaths,
    engineUrl: listed.engineUrl,
  });
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api/diffusers/models');
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
