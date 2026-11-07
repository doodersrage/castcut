import { chatCompletion } from '../llm/client';
import {
  buildDayPremiseMessages,
  DAY_PREMISE_MAX_LENGTH,
  parseDayPremiseBeats,
  type DayPremiseBeat,
} from './premise';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  resolveRequestLlmModel,
  type LlmRequestOptions,
} from '../llm/request-options';

/** One LLM call: the premise's beats for these slots. Throws when the LLM is off or says nothing usable. */
export async function writeDayPremiseBeats(options: {
  premise: string;
  slotIds: string[];
  companions: boolean;
  previousBeats?: string[];
  llm?: LlmRequestOptions;
}): Promise<DayPremiseBeat[]> {
  const premise = options.premise.trim().slice(0, DAY_PREMISE_MAX_LENGTH);
  const previousBeats = options.previousBeats?.filter(beat => beat.trim()) ?? [];
  if (!premise && previousBeats.length === 0) throw new Error('Write the idea for the day first.');
  if (options.slotIds.length === 0) throw new Error('This Day has no slots.');
  if (!resolveRequestLlmEnabled(options.llm)) {
    throw new Error('Day from an idea needs the LLM. Turn it on under Settings → LLM.');
  }
  const ask = async (slotIds: string[]) =>
    parseDayPremiseBeats(
      await chatCompletion({
        messages: buildDayPremiseMessages({
          premise,
          slotIds,
          companions: options.companions,
          previousBeats,
        }),
        maxTokens: 120 + 90 * slotIds.length,
        temperature: 0.7,
        model: resolveRequestLlmModel(options.llm),
        endpoint: resolveRequestLlmEndpoint(options.llm),
        usageContext: { route: 'day-premise' },
      }),
      slotIds,
      { companions: options.companions }
    );
  const beats = await ask(options.slotIds);
  // A beat the checks drop leaves its moment empty — on a long board, several (5 of 9 written,
  // 2026-11-07). The ones missing are asked for once more, on their own.
  const missing = options.slotIds.filter(id => !beats.some(beat => beat.slotId === id));
  if (beats.length > 0 && missing.length > 0) {
    const more = await ask(missing).catch(() => []);
    beats.push(...more.filter(beat => missing.includes(beat.slotId)));
    beats.sort((a, b) => options.slotIds.indexOf(a.slotId) - options.slotIds.indexOf(b.slotId));
  }
  if (beats.length === 0) {
    throw new Error('The LLM did not write usable beats for that idea. Try again or reword it.');
  }
  return beats;
}
