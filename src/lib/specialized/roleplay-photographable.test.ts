import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

const replies: string[] = [];
const prompts: string[] = [];
const chatCompletion = mock.fn(async (input: { messages: Array<{ content: string }> }) => {
  prompts.push(input.messages.map(message => message.content).join('\n'));
  return replies.shift() ?? '';
});
mock.module('../llm-client', { namedExports: { chatCompletion, isLlmEnabled: () => false } });

const BIO = {
  name: 'Gloovi',
  look: 'black strapless lace mini dress',
  personality: 'Quiet and watchful.',
  catchphrase: 'Steep first.',
};
const LLM = { llmEnabled: true, allowTemplateFallback: false };
const STILL =
  'Gloovi lifts a steaming kettle high in the cottage kitchen as violet drones spiral around her wrist, steam curling into a question mark above her head.';
const SCENES = JSON.stringify({
  scenes: [
    { title: 'Kettle at dawn', blurb: 'She pours tea for the stranger', pose: { body: 'stand', people: 1 } },
    { title: 'Orchard walk', blurb: 'She walks the orchard rows', pose: { body: 'walk', people: 1 } },
    { title: 'Attic stitching', blurb: 'She stitches a cap by the window', pose: { body: 'sit', people: 1 } },
    { title: 'Market stall', blurb: 'She sells caps at the market', pose: { body: 'lean', people: 1 } },
  ],
});

describe('Story writer keeps stills photographable', () => {
  it('asks the scene writer for photographable beats unless the setup is fantasy', async () => {
    const { generateRoleplayScenes } = await import('./roleplay-generator');
    replies.push(SCENES);
    await generateRoleplayScenes({ personaId: 'custom', bio: BIO, llm: LLM, story: [] } as never);
    assert.match(prompts.at(-1)!, /Photographable: every still must be something a camera/);
    replies.push(SCENES);
    await generateRoleplayScenes({
      personaId: 'custom',
      customPersona: 'a hedge witch who brews spells',
      bio: BIO,
      llm: LLM,
      story: [],
    } as never);
    assert.doesNotMatch(prompts.at(-1)!, /Photographable:/);
  });

  it('drops impossible clauses from the written still, but not in a fantasy story', async () => {
    const { generateRoleplayPrompt } = await import('./roleplay-generator');
    const situation = { id: 's1', title: 'Kettle at dawn', blurb: 'She lifts the kettle' };
    replies.push(STILL);
    const plain = await generateRoleplayPrompt({
      personaId: 'custom',
      bio: BIO,
      llm: LLM,
      detail: 'balanced',
      situation,
    } as never);
    assert.match(prompts.at(-1)!, /Photographable:/);
    assert.match(plain.prompt, /lifts a steaming kettle high in the cottage kitchen/);
    assert.doesNotMatch(plain.prompt, /drones|question mark/);

    replies.push(STILL);
    const fantasy = await generateRoleplayPrompt({
      personaId: 'retail-vampire',
      bio: BIO,
      llm: LLM,
      detail: 'balanced',
      situation,
    } as never);
    assert.doesNotMatch(prompts.at(-1)!, /Photographable:/);
    assert.match(fantasy.prompt, /question mark/);
  });
});
