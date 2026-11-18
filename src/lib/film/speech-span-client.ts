'use client';

/** Where each clip's speech starts and ends (POST /api/film/speech-spans); {} when unreachable. */
export async function requestSpeechSpans(
  shots: ReadonlyArray<{ key: string; url: string; entryId?: string; spoken?: string }>
): Promise<Record<string, { startSec: number; endSec: number } | null>> {
  if (!shots.length) return {};
  const response = await fetch('/api/film/speech-spans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ shots }),
  }).catch(() => null);
  if (!response?.ok) return {};
  const json = (await response.json().catch(() => null)) as {
    spans?: Record<string, { startSec: number; endSec: number } | null>;
  } | null;
  return json?.spans ?? {};
}
