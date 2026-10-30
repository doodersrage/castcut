import { chatCompletion } from '../llm/client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  resolveRequestLlmModel,
  type LlmRequestOptions,
} from '../llm/request-options';
import type { ScriptScene } from '../script/parse';
import { buildShotDraftMessages, parseShotDraft } from './script-shots-llm';
import type { PlannedShot } from './script-shots';

/** One LLM call: the scene's shot list. Throws when the LLM is off or says nothing usable. */
export async function writeShotDraft(
  scene: ScriptScene,
  llm?: LlmRequestOptions
): Promise<PlannedShot[]> {
  if (!resolveRequestLlmEnabled(llm)) {
    throw new Error('Draft with the LLM needs the LLM. Turn it on under Settings → LLM.');
  }
  const reply = await chatCompletion({
    messages: buildShotDraftMessages(scene),
    maxTokens: 1800,
    temperature: 0.5,
    model: resolveRequestLlmModel(llm),
    endpoint: resolveRequestLlmEndpoint(llm),
    usageContext: { route: 'script-shots' },
  });
  const shots = parseShotDraft(reply, scene);
  if (!shots) throw new Error('The LLM did not write a usable shot list. Try again.');
  return shots;
}
