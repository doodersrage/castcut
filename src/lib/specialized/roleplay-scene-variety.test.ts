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
