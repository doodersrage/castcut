'use client';

type NarrationLineInput = {
  line: string;
  speaker: 'woman' | 'man';
  voiceSample?: string;
  /**
   * The sample is a base voice Cut gave them (cast/voice.ts castVoiceIsBase): read in it by the
   * voice engine; without the engine, on the seed alone (LTX through a sample is twice as slow).
   */
  voiceBase?: boolean;
  /** How the line is said (line-delivery.ts): the voice engine reads it with the kept voice. */
  delivery?: string;
  /** The speaker's own seed (still-lines.ts speakerSeed), so their lines keep one voice. */
  seed?: number;
  /** A line said in a scene: acted, with the scene's sound (narration-server.ts). */
  inScene?: boolean;
};

/** Read one line (POST /api/film/narration): its ComfyUI audio view URL, and its length when known. */
export async function renderSpokenLine(
  input: NarrationLineInput
): Promise<{ url: string; seconds?: number }> {
  const response = await fetch('/api/film/narration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(input),
  });
  const json = (await response.json().catch(() => ({}))) as {
    url?: string;
    seconds?: number;
    error?: string;
  };
  if (!response.ok || !json.url) throw new Error(json.error ?? 'Narration failed.');
  return {
    url: json.url,
    ...(typeof json.seconds === 'number' && json.seconds > 0 ? { seconds: json.seconds } : {}),
  };
}

/** Render one narration line (POST /api/film/narration); its ComfyUI audio view URL. */
export async function renderNarrationLine(input: NarrationLineInput): Promise<string> {
  return (await renderSpokenLine(input)).url;
}
