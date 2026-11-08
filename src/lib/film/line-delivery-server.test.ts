import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

let sent = '';
mock.module('../llm/client', {
  namedExports: {
    chatCompletion: async (request: { messages: Array<{ content: string }> }) => {
      sent = request.messages.map(message => message.content).join('\n');
      return '{"deliveries":[{"id":"2","delivery":"dry, teasing"},{"id":"1","delivery":"tired, low"}]}';
    },
  },
});

describe('line-delivery-server', async () => {
  const { writeLineDeliveries } = await import('./line-delivery-server');

  it('asks for the lines by number and gives each delivery back to its own line', async () => {
    const got = await writeLineDeliveries([
      { id: 'scenes:scene-script-abc-morning-1', speaker: 'Lena', text: 'Long day.' },
      { id: 'scenes:scene-script-abc-morning-2', speaker: 'Rob', text: 'Every day is.' },
    ]);
    assert.doesNotMatch(sent, /scene-script-abc/);
    assert.deepEqual(got, {
      'scenes:scene-script-abc-morning-1': 'tired, low',
      'scenes:scene-script-abc-morning-2': 'dry, teasing',
    });
  });
});
