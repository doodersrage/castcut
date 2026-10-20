'use client';

import { useEffect } from 'react';
import { loadKeyboardShortcuts, parseCombo } from '@/lib/app/keyboard-shortcuts-store';

/** Queue/generate shortcuts stay available while typing in fields. */
const TYPING_OK_ACTIONS = new Set(['primary-generate', 'send-comfyui']);

export default function KeyboardShortcuts() {
  useEffect(() => {
    const bindings = loadKeyboardShortcuts();
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inField = Boolean(
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      );

      for (const binding of bindings) {
        if (!binding.selector || binding.action === 'command-palette') {
          continue;
        }
        if (inField && !TYPING_OK_ACTIONS.has(binding.action)) {
          continue;
        }
        const combo = parseCombo(binding.combo);
        const ctrl = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        const expectedKey = combo.key === 'enter' ? 'enter' : combo.key;
        if (ctrl === combo.ctrl && event.shiftKey === combo.shift && key === expectedKey) {
          event.preventDefault();
          document.querySelector<HTMLElement>(binding.selector)?.click();
          return;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return null;
}

export function keyboardShortcutHelp(): string {
  return loadKeyboardShortcuts()
    .map(entry => `${entry.combo}: ${entry.action}`)
    .join(' · ');
}
