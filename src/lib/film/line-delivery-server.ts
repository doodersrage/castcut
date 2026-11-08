import { chatCompletion } from '../llm/client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  resolveRequestLlmModel,
  type LlmRequestOptions,
} from '../llm/request-options';
import {
  buildLineDeliveryMessages,
  parseLineDelivery,
  type LineDeliveryAsk,
} from './line-delivery';

/** One LLM call: a short delivery for each line (line-delivery.ts). Empty when the LLM is off. */
export async function writeLineDeliveries(
  asks: readonly LineDeliveryAsk[],
  llm?: LlmRequestOptions,
  options: { adult?: boolean } = {}
): Promise<Record<string, string>> {
  if (!asks.length || !resolveRequestLlmEnabled(llm)) return {};
  // The model sees the lines numbered 1…n, not by their keys: a Scene key is ~20 tokens the reply
  // writes back on every line, and the reply is what takes the time (30 lines: 34-38 s with keys).
  const numbered = asks.map((ask, index) => ({
    ...ask,
    id: String(index + 1),
    ...(ask.context ? { context: ask.context.slice(0, 160) } : {}),
  }));
  const reply = await chatCompletion({
    messages: buildLineDeliveryMessages(numbered, options),
    maxTokens: 60 + asks.length * 24,
    temperature: 0.6,
    model: resolveRequestLlmModel(llm),
    endpoint: resolveRequestLlmEndpoint(llm),
    usageContext: { route: 'film-line-delivery' },
  });
  const byNumber = parseLineDelivery(
    reply,
    numbered.map(ask => ask.id)
  );
  return Object.fromEntries(
    Object.entries(byNumber).map(([number, delivery]) => [asks[Number(number) - 1]!.id, delivery])
  );
}
