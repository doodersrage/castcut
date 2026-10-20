import { lintPrompt } from '@/lib/prompt/diagnostics';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type LintRequestBody = {
  hints?: string;
  prompt?: string;
};

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/lint');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LintRequestBody;
    const hints = body.hints?.trim() ?? '';
    const prompt = body.prompt?.trim() ?? '';

    if (!hints && !prompt) {
      return apiError('Provide hints and/or prompt to lint.', 400);
    }

    return apiJson(lintPrompt({ hints, prompt }));
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Lint failed.', 500);
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
