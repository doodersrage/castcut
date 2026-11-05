import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildMotionTransferGraph } from './motion-transfer';

describe('copy moves graph', () => {
  it('samples with dpmpp_2m, not the template’s stepping lcm', () => {
    const graph = buildMotionTransferGraph({
      reference: 'still.png', video: 'drive.mp4', prompt: 'p', motion: 'a woman dancing',
      width: 464, height: 832, frames: 81, seed: 1, prefix: 'x',
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    const select = Object.values(graph).find(node => node.class_type === 'KSamplerSelect');
    assert.equal(select?.inputs.sampler_name, 'dpmpp_2m');
  });
});
