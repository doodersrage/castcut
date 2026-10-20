import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  GENERATE_HANDOFF_KEY,
  clearGenerateHandoff,
  consumeGenerateHandoff,
  loadGenerateHandoff,
  saveGenerateHandoff,
} from './generate-handoff';

const store = new Map<string, string>();

function installSessionStorage(): void {
  const sessionStorage = {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { sessionStorage },
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: sessionStorage,
  });
}

afterEach(() => {
  store.clear();
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
});

describe('generate handoff', () => {
  it('round-trips prompt and negative', () => {
    installSessionStorage();
    saveGenerateHandoff({
      prompt: 'a portrait',
      negativePrompt: 'blurry',
      savedAt: Date.now(),
    });
    const loaded = loadGenerateHandoff();
    assert.equal(loaded?.prompt, 'a portrait');
    assert.equal(loaded?.negativePrompt, 'blurry');
    clearGenerateHandoff();
    assert.equal(loadGenerateHandoff(), null);
    assert.equal(store.has(GENERATE_HANDOFF_KEY), false);
  });

  it('survives a second consume after storage was cleared', () => {
    installSessionStorage();
    saveGenerateHandoff({
      prompt: 'a portrait',
      negativePrompt: 'blurry',
      savedAt: Date.now(),
    });
    const first = consumeGenerateHandoff();
    const second = consumeGenerateHandoff();
    assert.equal(first?.prompt, 'a portrait');
    assert.equal(second?.prompt, 'a portrait');
    assert.equal(store.has(GENERATE_HANDOFF_KEY), false);
  });

  it('expires after 30 minutes', () => {
    installSessionStorage();
    saveGenerateHandoff({
      prompt: 'stale',
      savedAt: Date.now() - 31 * 60 * 1000,
    });
    assert.equal(loadGenerateHandoff(), null);
  });
});
