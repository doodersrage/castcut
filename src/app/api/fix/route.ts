import { fixPromptRules } from '@/lib/prompt/fix';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type FixRequestBody = {
  hints?: string;
  prompt?: string;
};

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/fix');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FixRequestBody;
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return apiError('Prompt is required.', 400);
    }

    return apiJson(fixPromptRules({ hints: body.hints, prompt }));
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Fix failed.', 500);
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
