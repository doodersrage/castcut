import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

type EnsureBody = {
  engineUrl?: string;
  /** Browser Settings toggle; default true. */
  autoStart?: boolean;
};

export async function POST(request: Request) {
  let body: EnsureBody = {};
  try {
    body = (await request.json()) as EnsureBody;
  } catch {
    body = {};
  }

  const { ensureDiffusersRunning } = await import('@/lib/engine/diffusers-autostart');
  const result = await ensureDiffusersRunning({
    engineUrl: body.engineUrl?.trim() || undefined,
    autoStart: body.autoStart !== false,
  });

  if (!result.ok) {
    return apiError(result.error || 'Diffusers engine unavailable.', 503, {
      url: result.url,
      started: result.started,
    });
  }

  return apiJson({
    ok: true,
    url: result.url,
    started: result.started,
    alreadyRunning: result.alreadyRunning === true,
    device: result.device,
    model: result.model,
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { ensureDiffusersRunning } = await import('@/lib/engine/diffusers-autostart');
  const result = await ensureDiffusersRunning({
    engineUrl: searchParams.get('engineUrl')?.trim() || undefined,
    autoStart: searchParams.get('autoStart') !== '0',
  });

  if (!result.ok) {
    return apiError(result.error || 'Diffusers engine unavailable.', 503, {
      url: result.url,
      started: result.started,
    });
  }

  return apiJson({
    ok: true,
    url: result.url,
    started: result.started,
    alreadyRunning: result.alreadyRunning === true,
    device: result.device,
    model: result.model,
  });
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function PUT() {
  return apiMethodNotAllowed(['GET', 'POST'], '/api/diffusers/ensure');
}
