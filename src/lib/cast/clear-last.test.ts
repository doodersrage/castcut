import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resetBrowserStorageCache } from '../storage/browser-storage';
import { getCharacter, upsertCharacter } from '../character/os';
import { saveCastMarks } from './marks';

function installMemoryWindow() {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      sessionStorage: {
        getItem: (key: string) => storage.get(`s:${key}`) ?? null,
        setItem: (key: string, value: string) => storage.set(`s:${key}`, value),
        removeItem: (key: string) => storage.delete(`s:${key}`),
      },
      dispatchEvent: () => true,
    },
  });
  resetBrowserStorageCache();
}

describe('removing the last entry of a Cast list sticks', () => {
  it('marks: remove the only mark (user report 2026-10-17: Remove did nothing)', () => {
    installMemoryWindow();
    upsertCharacter({ id: 'nora', name: 'Nora', version: 1, updatedAt: 1 });
    saveCastMarks('nora', [{ id: 'm1', what: 'freckles across her nose', where: 'face' }] as never);
    assert.equal(getCharacter('nora')?.marks?.length, 1);
    saveCastMarks('nora', []);
    assert.equal(getCharacter('nora')?.marks, undefined);
  });
});
