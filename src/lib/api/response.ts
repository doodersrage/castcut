import { NextResponse } from 'next/server';
import {
  friendlyError,
  friendlyErrorText,
  type FriendlyErrorOptions,
} from '../server/friendly-error';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Prompt-Api-Token',
} as const;

export function apiJson<T>(data: T, init?: ResponseInit & { status?: number }): NextResponse<T> {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...init?.headers,
    },
  });
}

/**
 * JSON error response. The message goes through friendlyErrorText: a bare
 * "fetch failed" becomes a plain "can't reach" sentence, stack frames and
 * ffmpeg stderr dumps are cut down, and long text is capped. When that
 * changes the text, or the status is 5xx, the raw message is logged once.
 */
export function apiError(
  message: string,
  status: number,
  extra?: Record<string, unknown>,
  headers?: HeadersInit
) {
  const raw = typeof message === 'string' ? message : String(message ?? '');
  const friendly = friendlyErrorText(raw, { maxLength: status >= 500 ? 300 : 600 });
  if (status >= 500 || friendly !== raw.trim()) {
    console.error(`[api] ${status} ${raw}`);
  }
  return apiJson({ error: friendly, ...extra }, { status, headers });
}

export interface ApiErrorFromOptions extends FriendlyErrorOptions {
  extra?: Record<string, unknown>;
  headers?: HeadersInit;
  /** Status when the service couldn't be reached. Default 503. */
  unreachableStatus?: number;
}

/**
 * Error response from a caught error: keeps the cause (so "fetch failed"
 * can name ComfyUI or the LLM and its address), logs the full detail once,
 * and answers 503 when the service was unreachable.
 */
export function apiErrorFrom(error: unknown, status: number, options: ApiErrorFromOptions = {}) {
  const { extra, headers, unreachableStatus = 503, ...friendlyOptions } = options;
  // Errors that know their answer (e.g. MissingModelsError: 424 + file names + fix link).
  const own = error as { httpStatus?: unknown; responseExtra?: unknown } | null;
  const ownStatus = typeof own?.httpStatus === 'number' ? own.httpStatus : undefined;
  const ownExtra =
    own?.responseExtra && typeof own.responseExtra === 'object'
      ? (own.responseExtra as Record<string, unknown>)
      : undefined;
  const friendly = friendlyError(error, {
    maxLength: (ownStatus ?? status) >= 500 ? 300 : 600,
    ...friendlyOptions,
  });
  const finalStatus = ownStatus ?? (friendly.unreachable ? unreachableStatus : status);
  console.error(`[api] ${finalStatus} ${friendly.detail}`);
  return apiJson(
    {
      error: friendly.message,
      ...(friendly.unreachable ? { unreachable: friendly.unreachable } : {}),
      ...ownExtra,
      ...extra,
    },
    { status: finalStatus, headers }
  );
}

export function apiMethodNotAllowed(allowed: string[], path: string) {
  return apiError(`Method not allowed. Use ${allowed.join(' or ')} on ${path}.`, 405, {
    allowedMethods: allowed,
    path,
  });
}

export function apiOptions(
  methods = 'POST, OPTIONS',
  allowHeaders = 'Content-Type, Authorization'
) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': methods,
      'Access-Control-Allow-Headers': allowHeaders,
    },
  });
}

export function requestBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return url.origin;
}
