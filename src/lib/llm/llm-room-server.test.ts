import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isLlmGpuRoomFailure,
  llmSharesComfyMachine,
  makeRoomForLocalLlm,
} from './llm-room-server';

describe('room on the GPU for a local LLM (phase 6)', () => {
  it('knows a load that failed for want of GPU memory', () => {
    // LM Studio, live 2026-11-19: ComfyUI held 17 GB between jobs.
    assert.equal(
      isLlmGpuRoomFailure('Failed to initialize the context: failed to allocate compute pp buffers'),
      true
    );
    assert.equal(isLlmGpuRoomFailure('CUDA error: out of memory'), true);
    // What LM Studio's API answers then (its log has the allocation failure).
    assert.equal(
      isLlmGpuRoomFailure(
        '{"error":{"message":"Failed to load model \\"nsfwvision-qwen3-vl-8b-v3\\". Error: Failed to load model."}}'
      ),
      true
    );
    assert.equal(isLlmGpuRoomFailure('model not found'), false);
    assert.equal(isLlmGpuRoomFailure('failed to decode: kv cache full'), false);
  });

  it('frees ComfyUI only on the same machine', () => {
    assert.equal(llmSharesComfyMachine('http://127.0.0.1:1234/v1', 'http://localhost:8188'), true);
    assert.equal(
      llmSharesComfyMachine('http://host.docker.internal:1234/v1', 'http://host.docker.internal:8188'),
      true
    );
    assert.equal(llmSharesComfyMachine('http://127.0.0.1:1234/v1', 'http://gpu-box:8188'), false);
    assert.equal(llmSharesComfyMachine('https://api.example.com/v1', 'http://127.0.0.1:8188'), false);
  });

  it('frees an idle ComfyUI and waits for it; never a busy one', async () => {
    const freed: string[] = [];
    const deps = (running: number, pending: number) => ({
      comfyUrl: 'http://127.0.0.1:8188/',
      fetchQueue: async () => ({ running, pending }),
      free: async (url: string) => (freed.push(url), true),
      wait: async () => {},
    });
    assert.equal(await makeRoomForLocalLlm('http://127.0.0.1:1234/v1', deps(0, 0)), true);
    assert.deepEqual(freed, ['http://127.0.0.1:8188']);
    assert.equal(await makeRoomForLocalLlm('http://127.0.0.1:1234/v1', deps(1, 0)), false);
    assert.equal(await makeRoomForLocalLlm('http://127.0.0.1:1234/v1', deps(0, 2)), false);
    assert.equal(freed.length, 1);
    // Unreachable ComfyUI: nothing done.
    assert.equal(
      await makeRoomForLocalLlm('http://127.0.0.1:1234/v1', {
        ...deps(0, 0),
        fetchQueue: async () => null,
      }),
      false
    );
    // An LLM on another machine: nothing done.
    assert.equal(await makeRoomForLocalLlm('https://api.example.com/v1', deps(0, 0)), false);
    assert.equal(freed.length, 1);
  });
});
