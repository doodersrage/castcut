import { formatPrompt, normalizeFormatSettings, type FormatMode } from '@/lib/prompt/formatter';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type FormatRequestBody = {
  input?: string;
  model?: string;
  detail?: string;
  mode?: FormatMode;
  smartFormat?: boolean;
};

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/format');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FormatRequestBody;
    const input = body.input?.trim();
    const settings = normalizeFormatSettings({
      model: body.model,
      detail: body.detail,
      mode: body.mode,
      smartFormat: body.smartFormat,
    });

    if (!input) {
      return apiError('Input is required.', 400);
    }

    if (input.length > 8000) {
      return apiError('Input must be 8000 characters or fewer.', 400);
    }

    const result = await formatPrompt(input, settings);
    return apiJson(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to format prompt.';

    return apiError(message, 500);
  }
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
