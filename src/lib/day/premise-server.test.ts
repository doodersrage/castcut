import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { writeDayPremiseBeats } from './premise-server';

describe('Write it on the server: Intimate', () => {
  const before = process.env.PROMPT_NSFW_GENERATOR_ENABLED;
  afterEach(() => {
    if (before === undefined) delete process.env.PROMPT_NSFW_GENERATOR_ENABLED;
    else process.env.PROMPT_NSFW_GENERATOR_ENABLED = before;
  });

  it('refuses adult beats unless the server allows adult content', async () => {
    delete process.env.PROMPT_NSFW_GENERATOR_ENABLED;
    await assert.rejects(
      writeDayPremiseBeats({
        premise: 'a lazy Sunday',
        slotIds: ['morning'],
        companions: false,
        mood: 'intimate',
      }),
      /needs adult content/
    );
  });

  it('lets them through to the LLM when it does (here: the LLM is off)', async () => {
    process.env.PROMPT_NSFW_GENERATOR_ENABLED = 'true';
    await assert.rejects(
      writeDayPremiseBeats({
        premise: 'a lazy Sunday',
        slotIds: ['morning'],
        companions: false,
        mood: 'intimate',
        llm: { llmEnabled: false },
      }),
      /needs the LLM/
    );
  });
});
