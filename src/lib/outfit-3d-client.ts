'use client';

/** Models built this session, by picture (a reopened 3D view is not rebuilt). */
const built = new Map<string, string>();

/** An outfit picture (a ComfyUI view URL) as a 3D model; the GLB's URL. Minutes of GPU. */
export async function requestOutfit3d(imageUrl: string): Promise<string> {
  const known = built.get(imageUrl);
  if (known) return known;
  const response = await fetch('/api/outfit-3d', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ imageUrl }),
  });
  const json = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!response.ok || !json.url) throw new Error(json.error ?? 'The 3D model failed.');
  built.set(imageUrl, json.url);
  return json.url;
}
