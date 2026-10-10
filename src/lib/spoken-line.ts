/**
 * Suggested lines for talking clips (ltx25-renderer withSpokenLine): what the Cast says to the
 * camera in a Day slot or Story scene. One short line, in their voice, fitting the scene — the
 * player taps it in; nothing talks unless they do.
 */

import { normalizeSpokenLine } from './ltx25-renderer';

/** About 5 s of speech. */
export const SPOKEN_LINE_MAX_WORDS = 14;

export type SpokenLineRequest = {
  /** What happens (Day beat / Story scene blurb). */
  scene: string;
  /** Where (Setting), when known. */
  setting?: string;
  /** Time of day / slot label. */
  when?: string;
  name?: string;
  /** Personality / catchphrase from the bible, when there is one. */
  personality?: string;
  /** 'man' writes him; else her. */
  lead?: 'woman' | 'man';
  /** Adult mood / rating: flirty is fine, never explicit. */
  adult?: boolean;
  /** Lines already used nearby — say something else. */
  avoid?: string[];
};

export function buildSpokenLineMessages(input: SpokenLineRequest) {
  const who = input.name?.trim() || (input.lead === 'man' ? 'he' : 'she');
  const lines = [
    `Write ONE line ${who} says out loud, looking into the camera, in a ~5 second video clip.`,
    `- 3 to ${SPOKEN_LINE_MAX_WORDS - 2} words. Natural spoken English, like a vlog or a moment caught on a phone.`,
    '- It must fit what is happening right now and the time of day. First person.',
    '- No quotation marks, no stage directions, no emojis, no hashtags, no names of real people or brands.',
    input.adult
      ? '- Playful or flirty is fine; no explicit sexual words.'
      : '- Keep it clean and friendly.',
    '- Reply with the line only.',
  ];
  const user = [
    `Scene: ${input.scene.trim().slice(0, 400)}`,
    input.setting?.trim() ? `Where: ${input.setting.trim().slice(0, 200)}` : '',
    input.when?.trim() ? `When: ${input.when.trim()}` : '',
    input.personality?.trim() ? `Personality: ${input.personality.trim().slice(0, 300)}` : '',
    input.avoid?.length ? `Do not repeat: ${input.avoid.slice(0, 6).join(' | ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return [
    { role: 'system' as const, content: lines.join('\n') },
    { role: 'user' as const, content: user },
  ];
}

/** The LLM's reply as a usable line, or '' when it is not one. */
export function parseSpokenLine(reply: string | null | undefined): string {
  const first =
    (reply ?? '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .split('\n')
      .map(line => line.trim())
      .find(line => line && !/^(line|answer|here)[^:]*:\s*$/i.test(line)) ?? '';
  const cleaned = first
    .replace(/^(line|answer)\s*:\s*/i, '')
    // *sighs*, (laughs), [smiles]: stage directions, not words.
    .replace(/\*[^*]+\*/g, ' ')
    .replace(/^[-•]\s*/, '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/#\w+/g, '');
  const line = normalizeSpokenLine(cleaned.replace(/^['‘’]+|['‘’]+$/g, ''));
  const words = line.split(/\s+/).filter(Boolean).length;
  return words >= 2 && words <= SPOKEN_LINE_MAX_WORDS ? line : '';
}

/** Ask `/api/spoken-line` for a line (client). Rejects with the server's message. */
export async function requestSpokenLine(
  input: SpokenLineRequest,
  llmBody?: Record<string, unknown>
): Promise<string> {
  const response = await fetch('/api/spoken-line', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ ...input, ...llmBody }),
  });
  const data = (await response.json().catch(() => ({}))) as { line?: string; error?: string };
  if (!response.ok || !data.line) throw new Error(data.error ?? 'Could not suggest a line.');
  return data.line;
}
