import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

const replies: string[] = [];
const prompts: string[] = [];
const chatCompletion = mock.fn(async (input: { messages: Array<{ content: string }> }) => {
  prompts.push(input.messages.map(message => message.content).join('\n'));
  return replies.shift() ?? '';
});
mock.module('../llm-client', { namedExports: { chatCompletion } });

const PLACES = [
  ['Rooftop at dusk', 'They slip onto the rooftop as the city lights come on'],
  ['Library after hours', 'A locked reading room and a borrowed key'],
  ['Garden greenhouse', 'Warm glass, rain on the roof, nobody around'],
  ['Night train cabin', 'The sleeper car rocks through the countryside'],
];
const scenes = (acts: string[]) =>
  JSON.stringify({
    scenes: acts.map((act, i) => ({
      title: PLACES[i]![0],
      blurb: PLACES[i]![1],
      pose: { body: 'stand', people: 2, act },
    })),
  });

describe('Story scene pose variety', () => {
  it('re-asks once when options repeat a pose, and keeps the more varied set', async () => {
    const { generateRoleplayScenes } = await import('./roleplay-generator');
    replies.push(scenes(['bent', 'bent', 'oral', 'lap']), scenes(['bent', 'prone', 'oral', 'lap']));
    const result = await generateRoleplayScenes({
      content: 'explicit',
      llm: { llmEnabled: true, allowTemplateFallback: false },
      story: [{ id: 'b1', title: 'Hotel', blurb: 'missionary on the hotel bed', at: 1 }],
    } as never);
    assert.equal(chatCompletion.mock.callCount(), 2);
    assert.match(prompts[0]!, /Recent beats already used: missionary/);
    assert.match(prompts[1]!, /Your last options repeated these poses: bent/);
    assert.deepEqual(
      result.scenes.map(scene => scene.pose?.act),
      ['bent', 'prone', 'oral', 'lap']
    );
  });

  it('does not re-ask when the options are already varied', async () => {
    const { generateRoleplayScenes } = await import('./roleplay-generator');
    chatCompletion.mock.resetCalls();
    replies.push(scenes(['bent', 'prone', 'oral', 'lap']));
    await generateRoleplayScenes({
      content: 'explicit',
      llm: { llmEnabled: true, allowTemplateFallback: false },
      story: [],
    } as never);
    assert.equal(chatCompletion.mock.callCount(), 1);
  });
});

describe('Story scene cards are checked before the player picks', () => {
  const four = (blurbs: string[]) =>
    JSON.stringify({
      scenes: blurbs.map((blurb, i) => ({ title: PLACES[i]![0], blurb })),
    });

  it('rewrites "they" for the lead without asking again', async () => {
    const { generateRoleplayScenes } = await import('./roleplay-generator');
    chatCompletion.mock.resetCalls();
    replies.length = 0;
    replies.push(
      four([
        'Mara lowers their cup on the rooftop ledge.',
        'She reads alone in the locked reading room.',
        'She waters the ferns under the glass roof.',
        'She watches fields roll past the window.',
      ])
    );
    const result = await generateRoleplayScenes({
      content: 'pg13',
      bio: { name: 'Mara', look: 'a woman in a yellow raincoat', personality: 'curious' },
      llm: { llmEnabled: true, allowTemplateFallback: false },
      story: [],
    } as never);
    assert.equal(chatCompletion.mock.callCount(), 1);
    assert.equal(result.scenes[0]!.blurb, 'Mara lowers her cup on the rooftop ledge.');
  });

  it('asks once more about a sexual card on a clean story, and drops it if it stays', async () => {
    const { generateRoleplayScenes } = await import('./roleplay-generator');
    chatCompletion.mock.resetCalls();
    replies.length = 0;
    const bad = four([
      'She is naked on the rooftop ledge.',
      'She reads alone in the locked reading room.',
      'She waters the ferns under the glass roof.',
      'She watches fields roll past the window.',
    ]);
    replies.push(bad, bad);
    const result = await generateRoleplayScenes({
      content: 'pg13',
      bio: { name: 'Mara', look: 'a woman in a yellow raincoat', personality: 'curious' },
      llm: { llmEnabled: true, allowTemplateFallback: false },
      story: [],
    } as never);
    assert.equal(chatCompletion.mock.callCount(), 2);
    assert.match(prompts.at(-1)!, /A clean story scene has sexual wording/);
    assert.ok(result.scenes.every(scene => !/naked/.test(scene.blurb)));
  });
});

describe('Story bible for a photo story', () => {
  it('asks the writer for clothes and props only, never the face or body', async () => {
    const { generateRoleplayBio } = await import('./roleplay-generator');
    chatCompletion.mock.resetCalls();
    replies.length = 0;
    prompts.length = 0;
    replies.push(JSON.stringify({ name: 'Tomas', look: 'a grey wool coat and a red scarf', personality: 'patient' }));
    await generateRoleplayBio({
      content: 'pg13',
      characterName: 'Tomas',
      hasReferenceImage: true,
      llm: { llmEnabled: true, allowTemplateFallback: false },
    } as never);
    assert.match(prompts[0]!, /never face, hair, skin, age or body/);
  });
});
