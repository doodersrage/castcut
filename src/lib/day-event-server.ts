import { chatCompletion } from './llm-client';
import {
  buildDayEventMessages,
  DAY_EVENT_MAX_LENGTH,
  parseDayEventPlan,
  type DayEventPlan,
} from './day-event';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  resolveRequestLlmModel,
  type LlmRequestOptions,
} from './llm-request-options';

/**
 * The event's moments from the LLM. Six tries: a small local model (Llama 3.2 3B) gave a usable
 * plan for 3 of 7 events, Qwen3-VL 8B for 6 of 7 — and 3 of 5 tries on a dinner *date*, where it
 * kept naming the date or a waiter; 7 of 15 once moments were kept to small steps, 6 of 15 with one posture (2026-10-12). Throws when the LLM is off or no try is usable.
 */
export async function writeDayEventPlan(options: {
  event: string;
  count: number;
  llm?: LlmRequestOptions;
}): Promise<DayEventPlan> {
  const event = options.event.trim().slice(0, DAY_EVENT_MAX_LENGTH);
  if (!event) throw new Error('Say what the event is first.');
  if (options.count < 2) throw new Error('An event needs at least two slots.');
  if (!resolveRequestLlmEnabled(options.llm)) {
    throw new Error('One event needs the LLM. Turn it on under Settings → LLM.');
  }
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    // A failed request (LM Studio's "failed to decode") is one try, like a plan that falls short.
    let reply: string;
    try {
      reply = await chatCompletion({
        messages: buildDayEventMessages({ event, count: options.count }),
        maxTokens: 200 + 110 * options.count,
        temperature: 0.7,
        model: resolveRequestLlmModel(options.llm),
        endpoint: resolveRequestLlmEndpoint(options.llm),
        usageContext: { route: 'day-event' },
      });
    } catch (error) {
      lastError = error;
      continue;
    }
    const plan = parseDayEventPlan(reply, options.count);
    if (plan) return plan;
  }
  if (lastError) {
    throw lastError instanceof Error ? lastError : new Error('The LLM request failed.');
  }
  throw new Error('The LLM did not write a usable event. Try again, or say it another way.');
}
