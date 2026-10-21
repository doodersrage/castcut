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
  const {
    DEFAULT_KEYBOARD_SHORTCUTS,
    loadKeyboardShortcuts,
    saveKeyboardShortcuts,
    parseCombo,
    comboMatchesEvent,
    keyboardShortcutActionLabel,
  } = await import('./keyboard-shortcuts-store');

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

  describe('copy-pair rebind (Ctrl+Shift+C is the browser inspector)', () => {
    it('defaults to Ctrl+Alt+C, clear of browser combos', () => {
      const copy = DEFAULT_KEYBOARD_SHORTCUTS.find(b => b.id === 'copy-pair');
      assert.equal(copy?.combo, 'Ctrl+Alt+C');
      assert.ok(!DEFAULT_KEYBOARD_SHORTCUTS.some(b => /^Ctrl\+Shift\+[CIJ]$/i.test(b.combo)));
    });

    it('moves a stored binding still on the old default, and saves it once', () => {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
      stored = [
        { id: 'copy-pair', combo: 'ctrl + shift + c', action: 'copy-pair', selector: '[x]' },
        { id: 'generate', combo: 'Ctrl+Enter', action: 'primary-generate' },
      ];
      const loaded = loadKeyboardShortcuts();
      assert.equal(loaded[0]?.combo, 'Ctrl+Alt+C');
      assert.equal(loaded[0]?.selector, '[x]');
      assert.equal(writeBrowserValue.mock.calls.length, 1);
      loadKeyboardShortcuts();
      assert.equal(writeBrowserValue.mock.calls.length, 1, 'already migrated');
    });

    it('keeps a combo the player chose', () => {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
      stored = [{ id: 'copy-pair', combo: 'Ctrl+Shift+Y', action: 'copy-pair' }];
      assert.equal(loadKeyboardShortcuts()[0]?.combo, 'Ctrl+Shift+Y');
      assert.equal(writeBrowserValue.mock.calls.length, 0);
    });
  });

  describe('comboMatchesEvent', () => {
    const press = (over: Partial<KeyboardEvent>) =>
      ({ ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, key: '', code: '', ...over }) as KeyboardEvent;

    it('needs every modifier, and no extra one', () => {
      const combo = parseCombo('Ctrl+Alt+C');
      assert.ok(comboMatchesEvent(combo, press({ ctrlKey: true, altKey: true, key: 'c', code: 'KeyC' })));
      assert.ok(!comboMatchesEvent(combo, press({ ctrlKey: true, shiftKey: true, key: 'C', code: 'KeyC' })));
      assert.ok(!comboMatchesEvent(parseCombo('Ctrl+Enter'), press({ ctrlKey: true, altKey: true, key: 'Enter' })));
    });

    it('takes ⌘ for Ctrl, and the physical key when Option changes the letter', () => {
      const combo = parseCombo('Ctrl+Alt+C');
      assert.ok(comboMatchesEvent(combo, press({ ctrlKey: true, altKey: true, key: 'ç', code: 'KeyC' })));
      assert.ok(comboMatchesEvent(parseCombo('Ctrl+K'), press({ metaKey: true, key: 'k', code: 'KeyK' })));
    });
  });

  it('labels actions for the cheat sheet', () => {
    assert.equal(keyboardShortcutActionLabel('copy-pair'), 'Copy prompt pair');
    assert.equal(keyboardShortcutActionLabel('custom-thing'), 'custom-thing');
  });

  describe('parseCombo', () => {
    it('parses ctrl+shift+letter combos', () => {
      assert.deepEqual(parseCombo('Ctrl+Shift+C'), { ctrl: true, shift: true, alt: false, key: 'c' });
    });

    it('parses a bare key with no modifiers', () => {
      assert.deepEqual(parseCombo('K'), { ctrl: false, shift: false, alt: false, key: 'k' });
    });

    it('treats "Cmd" as a ctrl-equivalent modifier', () => {
      assert.deepEqual(parseCombo('Cmd+K'), { ctrl: true, shift: false, alt: false, key: 'k' });
    });

    it('trims whitespace around each part', () => {
      assert.deepEqual(parseCombo(' Ctrl + Enter '), { ctrl: true, shift: false, alt: false, key: 'enter' });
    });

    it('reads Alt / Option', () => {
      assert.deepEqual(parseCombo('Ctrl+Alt+C'), { ctrl: true, shift: false, alt: true, key: 'c' });
      assert.equal(parseCombo('Cmd+Option+C').alt, true);
    });

    it('lowercases the key', () => {
      assert.deepEqual(parseCombo('Ctrl+ENTER'), { ctrl: true, shift: false, alt: false, key: 'enter' });
    });

    it('returns an empty key for an empty string', () => {
      assert.deepEqual(parseCombo(''), { ctrl: false, shift: false, alt: false, key: '' });
    });
  });
});
