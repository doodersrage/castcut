import { chatCompletion } from './llm-client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  resolveRequestLlmModel,
  type LlmRequestOptions,
} from './llm-request-options';
import { buildDubMessages, parseDubReply } from './day-dub';

/** Translate spoken lines for a dub (day-dub.ts) — one LLM call, two tries. */
export async function translateDubLines(
  lines: string[],
  language: string,
  llm?: LlmRequestOptions
): Promise<string[]> {
  if (!resolveRequestLlmEnabled(llm)) {
    throw new Error(
      'Dubbing needs the LLM to translate the lines. Turn it on under Settings → LLM.'
    );
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reply = await chatCompletion({
      messages: buildDubMessages(lines, language),
      maxTokens: 120 + lines.length * 80,
      temperature: 0.3,
      model: resolveRequestLlmModel(llm),
      endpoint: resolveRequestLlmEndpoint(llm),
      usageContext: { route: 'dub-lines' },
    });
    const parsed = parseDubReply(reply, lines.length);
    if (parsed) return parsed;
  }
  throw new Error('The LLM did not translate every line. Try again.');
}
