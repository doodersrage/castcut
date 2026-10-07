import { chatCompletion } from './llm-client';
import {
  buildDayPremiseMessages,
  DAY_PREMISE_MAX_LENGTH,
  parseDayPremiseBeats,
  type DayPremiseBeat,
} from './day-premise';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  resolveRequestLlmModel,
  type LlmRequestOptions,
} from './llm-request-options';

/** One LLM call: the premise's beats for these slots. Throws when the LLM is off or says nothing usable. */
export async function writeDayPremiseBeats(options: {
  premise: string;
  slotIds: string[];
  companions: boolean;
  llm?: LlmRequestOptions;
}): Promise<DayPremiseBeat[]> {
  const premise = options.premise.trim().slice(0, DAY_PREMISE_MAX_LENGTH);
  if (!premise) throw new Error('Write the idea for the day first.');
  if (options.slotIds.length === 0) throw new Error('This Day has no slots.');
  if (!resolveRequestLlmEnabled(options.llm)) {
    throw new Error('Day from an idea needs the LLM. Turn it on under Settings → LLM.');
  }
  const reply = await chatCompletion({
    messages: buildDayPremiseMessages({
      premise,
      slotIds: options.slotIds,
      companions: options.companions,
    }),
    maxTokens: 120 + 90 * options.slotIds.length,
    temperature: 0.7,
    model: resolveRequestLlmModel(options.llm),
    endpoint: resolveRequestLlmEndpoint(options.llm),
    usageContext: { route: 'day-premise' },
  });
  const beats = parseDayPremiseBeats(reply, options.slotIds, { companions: options.companions });
  if (beats.length === 0) {
    throw new Error('The LLM did not write usable beats for that idea. Try again or reword it.');
  }
  return beats;
}
