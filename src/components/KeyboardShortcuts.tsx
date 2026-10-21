'use client';

import { useEffect } from 'react';
import {
  comboMatchesEvent,
  keyboardShortcutActionLabel,
  loadKeyboardShortcuts,
  parseCombo,
} from '@/lib/app/keyboard-shortcuts-store';

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
        if (comboMatchesEvent(parseCombo(binding.combo), event)) {
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
    .map(entry => `${entry.combo}: ${keyboardShortcutActionLabel(entry.action)}`)
    .join(' · ');
}
