import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { compactPromptToLimit } from '@/lib/prompt/compact-prompt';
import { normalizeDetailLevel } from '@/lib/prompt/detail-level';
import { normalizeComfyModel } from '@/lib/comfy-models';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type CompactRequestBody = {
  prompt?: string;
  model?: string;
  detail?: string;
};

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/compact');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CompactRequestBody;
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return apiError('Prompt is required.', 400);
    }

    const model = normalizeComfyModel(body.model);
    const detail = normalizeDetailLevel(body.detail);
    const result = compactPromptToLimit(prompt, model, detail);

    return apiJson(result);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Compact failed.', 500);
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
