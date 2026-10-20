'use client';

/** Render one narration line (POST /api/film/narration); its ComfyUI audio view URL. */
export async function renderNarrationLine(input: {
  line: string;
  speaker: 'woman' | 'man';
  voiceSample?: string;
}): Promise<string> {
  const response = await fetch('/api/film/narration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(input),
  });
  const json = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!response.ok || !json.url) throw new Error(json.error ?? 'Narration failed.');
  return json.url;
}
