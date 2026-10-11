import { NextResponse } from 'next/server';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { assertSafeHttpUrl, isWebhookPrivateAllowed } from '@/lib/url-safety';
import { formatWebhookPayload } from '@/lib/webhook-payload';
import type { WebhookJobPayload } from '@/lib/webhook-settings';

export const runtime = 'nodejs';

type DispatchBody = {
  url?: string;
  secret?: string;
  payload?: Record<string, unknown>;
  template?: import('@/lib/webhook-payload').WebhookTemplate;
};

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/webhooks/dispatch');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DispatchBody;
    const url = body.url?.trim();
    if (!url) {
      return apiError('Webhook URL is required.', 400);
    }

    let safeUrl: URL;
    try {
      safeUrl = assertSafeHttpUrl(url, {
        allowPrivate: isWebhookPrivateAllowed(),
      });
      // A public-looking name that resolves to a private address is refused too.
      if (!isWebhookPrivateAllowed()) {
        const { assertPublicFetchUrl } = await import('@/lib/url-safety-server');
        safeUrl = await assertPublicFetchUrl(safeUrl.toString());
      }
    } catch (error) {
      return apiError(error instanceof Error ? error.message : 'Invalid webhook URL.', 400);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (body.secret?.trim()) {
      headers['X-Prompt-Tools-Secret'] = body.secret.trim();
    }

    const template = body.template ?? 'generic';
    const payload = formatWebhookPayload((body.payload ?? {}) as WebhookJobPayload, template);

    const response = await fetch(safeUrl.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });

    return apiJson({
      ok: response.ok,
      status: response.status,
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Webhook dispatch failed.', 502);
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
