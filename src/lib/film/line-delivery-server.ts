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
  const reply = await chatCompletion({
    messages: buildLineDeliveryMessages(asks, options),
    maxTokens: 60 + asks.length * 40,
    temperature: 0.6,
    model: resolveRequestLlmModel(llm),
    endpoint: resolveRequestLlmEndpoint(llm),
    usageContext: { route: 'film-line-delivery' },
  });
  return parseLineDelivery(
    reply,
    asks.map(ask => ask.id)
  );
}
