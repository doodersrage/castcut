import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { KeyboardShortcutBinding } from './keyboard-shortcuts-store';

let stored: unknown = null;
const readBrowserValue = mock.fn(<T>(): T | null => stored as T | null);
const writeBrowserValue = mock.fn((_key: string, value: unknown) => {
  stored = value;
});
mock.module('../storage/browser-storage', { namedExports: { readBrowserValue, writeBrowserValue } });

afterEach(() => {
  stored = null;
  delete (globalThis as { window?: unknown }).window;
  readBrowserValue.mock.resetCalls();
  writeBrowserValue.mock.resetCalls();
});

describe('keyboard-shortcuts-store', async () => {
  const { DEFAULT_KEYBOARD_SHORTCUTS, loadKeyboardShortcuts, saveKeyboardShortcuts, parseCombo } =
    await import('./keyboard-shortcuts-store');

  describe('loadKeyboardShortcuts', () => {
    it('returns the defaults when window is undefined (SSR guard)', () => {
      assert.deepEqual(loadKeyboardShortcuts(), DEFAULT_KEYBOARD_SHORTCUTS);
      assert.equal(readBrowserValue.mock.calls.length, 0);
    });

    it('returns the defaults when nothing is stored', () => {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
      stored = null;
      assert.deepEqual(loadKeyboardShortcuts(), DEFAULT_KEYBOARD_SHORTCUTS);
    });

    it('returns the stored bindings when present', () => {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
      const custom: KeyboardShortcutBinding[] = [
        { id: 'custom', combo: 'Ctrl+J', action: 'do-thing' },
      ];
      stored = custom;
      assert.deepEqual(loadKeyboardShortcuts(), custom);
    });
  });

  describe('saveKeyboardShortcuts', () => {
    it('is a no-op when window is undefined (SSR guard)', () => {
      saveKeyboardShortcuts([{ id: 'x', combo: 'Ctrl+X', action: 'x' }]);
      assert.equal(writeBrowserValue.mock.calls.length, 0);
    });

    it('persists bindings that loadKeyboardShortcuts can read back', () => {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
      const custom: KeyboardShortcutBinding[] = [
        { id: 'custom', combo: 'Ctrl+J', action: 'do-thing', selector: '[data-x]' },
      ];
      saveKeyboardShortcuts(custom);
      assert.deepEqual(loadKeyboardShortcuts(), custom);
    });
  });

  describe('DEFAULT_KEYBOARD_SHORTCUTS', () => {
    it('has one binding per default action, each with a combo', () => {
      const ids = DEFAULT_KEYBOARD_SHORTCUTS.map(b => b.id);
      assert.deepEqual(ids, ['generate', 'copy-pair', 'queue', 'palette']);
      for (const binding of DEFAULT_KEYBOARD_SHORTCUTS) {
        assert.ok(binding.combo.length > 0);
      }
    });
  });

  describe('parseCombo', () => {
    it('parses ctrl+shift+letter combos', () => {
      assert.deepEqual(parseCombo('Ctrl+Shift+C'), { ctrl: true, shift: true, key: 'c' });
    });

    it('parses a bare key with no modifiers', () => {
      assert.deepEqual(parseCombo('K'), { ctrl: false, shift: false, key: 'k' });
    });

    it('treats "Cmd" as a ctrl-equivalent modifier', () => {
      assert.deepEqual(parseCombo('Cmd+K'), { ctrl: true, shift: false, key: 'k' });
    });

    it('trims whitespace around each part', () => {
      assert.deepEqual(parseCombo(' Ctrl + Enter '), { ctrl: true, shift: false, key: 'enter' });
    });

    it('lowercases the key', () => {
      assert.deepEqual(parseCombo('Ctrl+ENTER'), { ctrl: true, shift: false, key: 'enter' });
    });

    it('returns an empty key for an empty string', () => {
      assert.deepEqual(parseCombo(''), { ctrl: false, shift: false, key: '' });
    });
  });
});
