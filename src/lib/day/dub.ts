/**
 * "Dub": a Day's (or Story's) spoken lines in another language. The lines are translated (the
 * local LLM) and the talking clips made again with each line said "in <language>" — the engine
 * speaks it lip-synced, as it does English. Live 2026-10-16 (MiniMax-H3, the user's armchair
 * still): Spanish 2/2 and French 2/2 word-exact by speech recognition. Laying only a new
 * soundtrack under the old clip (Add voice) said the Spanish line 1/2, and the lips stayed on
 * the old words. Pure, client-safe.
 */

/** Languages offered (the engines speak these well; English is the original). */
export const DUB_LANGUAGES = [
  'Spanish',
  'French',
  'German',
  'Italian',
  'Portuguese',
  'Japanese',
  'Korean',
  'Chinese',
] as const;

export function normalizeDubLanguage(value: unknown): string | undefined {
  return typeof value === 'string'
    ? DUB_LANGUAGES.find(entry => entry.toLowerCase() === value.trim().toLowerCase())
    : undefined;
}

/**
 * Every quoted line in a clip prompt said in the language: `says clearly, "…"` →
 * `says clearly in Spanish, "…"` (talking, conversation and moment prompts all introduce the
 * line with `, "`), plus one sentence saying all speech is in it.
 */
export function inSpokenLanguage(prompt: string, language: string | undefined): string {
  const lang = normalizeDubLanguage(language);
  if (!lang || !/"[^"]+"/.test(prompt)) return prompt;
  return `${prompt.replace(/,\s*"(?=[^"]+")/g, ` in ${lang}, "`).trim()} All speech is in ${lang}, with a native ${lang} accent.`;
}

/** LLM messages: translate numbered lines, keep the numbering, nothing else. */
export function buildDubMessages(
  lines: string[],
  language: string
): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content: `You translate short spoken lines for a film dub into natural, everyday ${language} — what a native speaker would actually say, same tone and length. Reply with the numbered translations only, one per line, in the same order. No notes, no quotes, no English.`,
    },
    { role: 'user', content: lines.map((line, index) => `${index + 1}. ${line}`).join('\n') },
  ];
}

/** The numbered translations back in order; null when any is missing. */
export function parseDubReply(reply: string, count: number): string[] | null {
  const out: string[] = [];
  for (const raw of reply.split('\n')) {
    const match = /^\s*(\d+)[.)]\s*(.+?)\s*$/.exec(raw);
    if (!match) continue;
    const index = Number(match[1]) - 1;
    const text = match[2]!.replace(/^["“«]+|["”»]+$/g, '').trim();
    if (index >= 0 && index < count && text && !out[index]) out[index] = text.slice(0, 200);
  }
  return out.length === count && out.every(Boolean) ? out : null;
}

/** Ask `/api/dub-lines` to translate (client). Rejects with the server's message. */
export async function requestDubLines(
  lines: string[],
  language: string,
  llmBody?: Record<string, unknown>
): Promise<string[]> {
  const response = await fetch('/api/dub-lines', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ lines, language, ...llmBody }),
  });
  const data = (await response.json().catch(() => ({}))) as { lines?: string[]; error?: string };
  if (!response.ok || !Array.isArray(data.lines)) {
    throw new Error(data.error ?? 'Could not translate the lines.');
  }
  return data.lines;
}
