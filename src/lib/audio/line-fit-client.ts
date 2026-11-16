'use client';

/** A talking clip's read line fitted to it (POST /api/film/line-fit); undefined when it can't be. */
export async function fitLineToClip(input: {
  clipUrl: string;
  entryId?: string;
  readFile: string;
  comfyUrl?: string;
}): Promise<string | undefined> {
  const response = await fetch('/api/film/line-fit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(input),
  }).catch(() => null);
  if (!response?.ok) return undefined;
  const json = (await response.json().catch(() => null)) as { url?: string } | null;
  return json?.url?.startsWith('/api/comfyui/view?') ? json.url : undefined;
}
