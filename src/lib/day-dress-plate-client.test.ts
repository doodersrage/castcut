import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ensureDayDressPlate, type DayDressPlateRequest } from './day-dress-plate-client';

function request(suffix: string): DayDressPlateRequest {
  return {
    model: 'qwen-image-edit-2511-lightning-8',
    plate: { filename: `cast-plate-${suffix}.png` },
    clothingKey: 'kit:dress-01',
    clothingLabel: 'black dress',
    footwear: '',
    subject: 'she',
  };
}

type Waiter = NonNullable<Parameters<typeof ensureDayDressPlate>[1]['waitForPromptIds']>;

describe('ensureDayDressPlate — a plate job that does not finish', () => {
  it('still queued when the wait runs out: the next still re-attaches, it does not queue another', async () => {
    let sent = 0;
    const waits: number[] = [];
    const waiter = (async (_ids: string[], options?: { timeoutMs?: number }) => {
      waits.push(options?.timeoutMs ?? 0);
      return [{ status: 'pending' }];
    }) as unknown as Waiter;
    const deps = {
      sendComfyUi: async () => {
        sent += 1;
        return 'prompt-1';
      },
      waitForPromptIds: waiter,
    };
    await assert.rejects(ensureDayDressPlate(request('stuck'), deps), /still waiting/);
    await assert.rejects(ensureDayDressPlate(request('stuck'), deps), /still waiting/);
    assert.equal(sent, 1);
    assert.equal(waits.length, 2);
    // The second look is brief — the first still already waited the long time.
    assert.ok(waits[1]! < waits[0]! / 10);
  });

  it('a failed render: later stills skip the plate for a while instead of queueing it again', async () => {
    let sent = 0;
    const waiter = (async () => [{ status: 'error' }]) as unknown as Waiter;
    const deps = {
      sendComfyUi: async () => {
        sent += 1;
        return 'prompt-2';
      },
      waitForPromptIds: waiter,
    };
    await assert.rejects(ensureDayDressPlate(request('failed'), deps), /did not render/);
    await assert.rejects(ensureDayDressPlate(request('failed'), deps), /failed a moment ago/);
    assert.equal(sent, 1);
  });
});
