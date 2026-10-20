import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseComfyUiSystemStats } from './system-stats';

describe('parseComfyUiSystemStats', () => {
  it('reads VRAM from devices[] (current ComfyUI shape)', () => {
    const parsed = parseComfyUiSystemStats({
      system: {
        ram_total: 64e9,
        ram_free: 40e9,
        comfyui_version: '0.3.50',
        python_version: '3.12.8 (main)',
        pytorch_version: '2.7.0',
      },
      devices: [
        {
          name: 'cuda:0 NVIDIA GeForce RTX 5090',
          vram_total: 32e9,
          vram_free: 24e9,
        },
      ],
    });
    assert.deepEqual(parsed.vram, { free: 24e9, total: 32e9 });
    assert.deepEqual(parsed.ram, { free: 40e9, total: 64e9 });
    assert.equal(parsed.version, '0.3.50');
    assert.equal(parsed.deviceName, 'cuda:0 NVIDIA GeForce RTX 5090');
    assert.equal(parsed.pythonVersion, '3.12.8 (main)');
  });

  it('falls back to legacy system.vram', () => {
    const parsed = parseComfyUiSystemStats({
      system: { vram: { free: 8e9, total: 16e9 } },
    });
    assert.deepEqual(parsed.vram, { free: 8e9, total: 16e9 });
  });

  it('prefers devices[] over legacy system.vram', () => {
    const parsed = parseComfyUiSystemStats({
      system: { vram: { free: 1e9, total: 2e9 } },
      devices: [{ vram_free: 20e9, vram_total: 24e9 }],
    });
    assert.deepEqual(parsed.vram, { free: 20e9, total: 24e9 });
  });

  it('returns empty stats for garbage', () => {
    assert.deepEqual(parseComfyUiSystemStats(null), {});
    assert.deepEqual(parseComfyUiSystemStats('nope'), {});
    assert.deepEqual(parseComfyUiSystemStats({ devices: [] }), {});
  });
});
