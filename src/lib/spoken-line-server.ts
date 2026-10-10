import { chatCompletion } from './llm-client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  resolveRequestLlmModel,
  type LlmRequestOptions,
} from './llm-request-options';
import { buildSpokenLineMessages, parseSpokenLine, type SpokenLineRequest } from './spoken-line';

/** One LLM call (two tries) for a talking clip's line. Throws when the LLM is off or says nothing usable. */
export async function suggestSpokenLine(
  input: SpokenLineRequest,
  llm?: LlmRequestOptions
): Promise<string> {
  if (!input.scene.trim()) throw new Error('Write the scene first.');
  if (!resolveRequestLlmEnabled(llm)) {
    throw new Error('Suggesting a line needs the LLM. Turn it on under Settings → LLM.');
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reply = await chatCompletion({
      messages: buildSpokenLineMessages(input),
      maxTokens: 60,
      temperature: 0.9,
      model: resolveRequestLlmModel(llm),
      endpoint: resolveRequestLlmEndpoint(llm),
      usageContext: { route: 'spoken-line' },
    });
    const line = parseSpokenLine(reply);
    if (line) return line;
  }
  throw new Error('The LLM did not write a usable line. Try again.');
}
