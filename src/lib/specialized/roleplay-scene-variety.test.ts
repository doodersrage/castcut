import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

const replies: string[] = [];
const prompts: string[] = [];
const chatCompletion = mock.fn(async (input: { messages: Array<{ content: string }> }) => {
  prompts.push(input.messages.map(message => message.content).join('\n'));
  return replies.shift() ?? '';
});
// isLlmEnabled: a still prompt's finishing pass asks it (no server LLM: the pass is skipped).
mock.module('../llm-client', { namedExports: { chatCompletion, isLlmEnabled: () => false } });

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

describe('Story writer reads the Cast lead Sex trait', () => {
  const genderlessBio = {
    name: 'Sam',
    look: 'a grey wool coat and a red scarf',
    personality: 'patient',
  };
  const cards = JSON.stringify({
    scenes: PLACES.map(([title]) => ({ title, blurb: 'Sam waits by the window.' })),
  });

  it('writes "he" for a man lead whose look says nothing about gender', async () => {
    const { generateRoleplayScenes, generateRoleplayPrompt } = await import('./roleplay-generator');
    replies.length = 0;
    prompts.length = 0;
    replies.push(cards, 'Sam waits by the rain-streaked window in a grey wool coat.');
    await generateRoleplayScenes({
      content: 'pg13',
      bio: genderlessBio,
      leadSex: 'man',
      llm: { llmEnabled: true, allowTemplateFallback: false },
      story: [],
    } as never);
    assert.match(prompts[0]!, /write "he" and "his" for Sam/);
    const { normalizeSharedGenerationOptions } = await import('./normalize');
    await generateRoleplayPrompt({
      ...normalizeSharedGenerationOptions({ llmEnabled: true, allowTemplateFallback: false }),
      content: 'pg13',
      bio: genderlessBio,
      leadSex: 'man',
      situation: { title: 'Rainy window', blurb: 'Sam waits by the window.' },
      story: [],
    } as never);
    assert.match(prompts.at(-1)!, /write "he" and "his" for Sam/);
  });

  it('maps the built-in scenes for a man lead from the Sex trait', async () => {
    const { generateRoleplayScenes } = await import('./roleplay-generator');
    const { storySceneForManLead } = await import('../story-lead-gender');
    const builtIn = (leadSex: string) =>
      generateRoleplayScenes({
        // A continued adult story: one built-in card says "behind her".
        content: 'explicit',
        bio: genderlessBio,
        leadSex,
        llm: { llmEnabled: false },
        story: [{ id: 'b1', title: 'Hotel bar', blurb: 'A drink at the hotel bar', at: 1 }],
      } as never);
    const woman = await builtIn('woman');
    const man = await builtIn('man');
    assert.equal(man.provider, 'template');
    assert.deepEqual(man.scenes, woman.scenes.map(storySceneForManLead));
    assert.notDeepEqual(man.scenes, woman.scenes);
  });

  it('keeps a woman lead "she" when her look mentions his boyfriend', async () => {
    const { generateRoleplayScenes } = await import('./roleplay-generator');
    const bio = {
      name: 'Mara',
      look: 'a yellow raincoat, holding his boyfriend’s umbrella',
      personality: 'curious',
    };
    replies.length = 0;
    prompts.length = 0;
    replies.push(cards, cards);
    await generateRoleplayScenes({
      content: 'pg13',
      bio,
      leadSex: 'woman',
      llm: { llmEnabled: true, allowTemplateFallback: false },
      story: [],
    } as never);
    assert.match(prompts[0]!, /write "she" and "her" for Mara/);
    // Without the trait the look alone reads as a man: the trait is what keeps her.
    await generateRoleplayScenes({
      content: 'pg13',
      bio,
      llm: { llmEnabled: true, allowTemplateFallback: false },
      story: [],
    } as never);
    assert.match(prompts.at(-1)!, /write "he" and "his" for Mara/);
  });
});

describe('Story still without the writer', () => {
  const story = [
    {
      id: 'b1',
      title: 'Book swap',
      blurb: 'Nora swaps an atlas',
      at: 1,
      stillBrief:
        'Nora balances a stack of books on her hip — warm wool cardigan over a faded floral dress, sunlit nook',
    },
  ];
  const base = {
    model: 'qwen-rapid-aio-edit',
    detail: 'balanced',
    content: 'clean',
    hasReferenceImage: true,
    isolatedSubject: true,
    bio: { name: 'Nora', look: 'a woman with blue eyes and a slim build', personality: 'kind' },
    situation: { title: 'Opposite play', blurb: 'Nora tries the opposite tactic.' },
    llm: { llmEnabled: false, allowTemplateFallback: true },
    story,
  };

  it('keeps the last still’s clothes and leaves the look to the reference', async () => {
    const { generateRoleplayPrompt } = await import('./roleplay-generator');
    const result = await generateRoleplayPrompt(base as never);
    assert.match(result.prompt, /she wears warm wool cardigan over a faded floral dress/);
    assert.doesNotMatch(result.prompt, /beat outfit|blue eyes|storybook/);
  });

  it('a picked outfit keeps the phrase the dressed plate rewords', async () => {
    const { generateRoleplayPrompt } = await import('./roleplay-generator');
    const result = await generateRoleplayPrompt({ ...base, wardrobeLabel: 'Denim kit' } as never);
    assert.match(result.prompt, /replace the reference clothing with the beat outfit/);
  });
});
