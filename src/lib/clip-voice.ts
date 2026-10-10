/**
 * "Add voice" (client): a finished silent clip — two-person adult clips render on WAN, which
 * makes no sound — gets a soundtrack from LTX-2.5 with its picture unchanged (/api/clip-voice,
 * clip-dub-server.ts). Rejects with the server's message.
 */
export async function requestClipVoice(input: {
  clipUrl: string;
  scene: string;
  line?: string;
  heat?: 'clean' | 'flirty' | 'sensual' | 'explicit';
  lead?: 'woman' | 'man';
}): Promise<string> {
  const response = await fetch('/api/clip-voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(input),
  });
  const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!response.ok || !data.url) throw new Error(data.error ?? 'Add voice failed.');
  return data.url;
}
