import { buildNegativePrompt } from '@/lib/prompt/negative-prompt-builder';
import { inferAthleticSport } from '@/lib/scene/athletic-sport-profiles';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type NegativeRequestBody = {
  hints?: string;
  sport?: string;
  preserveSubject?: boolean;
  soloSubject?: boolean;
  extra?: string;
};

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/negative');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as NegativeRequestBody;
    const hints = body.hints?.trim() ?? '';
    const sport = inferAthleticSport(body.sport ?? hints) ?? inferAthleticSport(hints) ?? null;

    const prompt = buildNegativePrompt({
      sport,
      preserveSubject: body.preserveSubject === true,
      soloSubject: body.soloSubject === true,
      extra: body.extra,
    });

    return apiJson({
      prompt,
      mode: body.preserveSubject ? 'preserve' : 'negative',
      sport,
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Negative prompt failed.', 500);
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
