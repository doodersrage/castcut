'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  comboMatchesEvent,
  keyboardShortcutActionLabel,
  loadKeyboardShortcuts,
  parseCombo,
} from '@/lib/app/keyboard-shortcuts-store';

/** Queue/generate shortcuts stay available while typing in fields. */
const TYPING_OK_ACTIONS = new Set(['primary-generate', 'send-comfyui']);

const KeyboardShortcutsHelp = dynamic(() => import('@/components/KeyboardShortcutsHelp'), {
  ssr: false,
});

export default function KeyboardShortcuts() {
  // "?" shows the shortcuts — this page's own keys first (2026-11-05).
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    const onQuestion = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key !== '?' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (target &&
          (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) ||
        document.querySelector('[role="dialog"]')
      ) {
        return;
      }
      event.preventDefault();
      setHelpOpen(true);
    };
    window.addEventListener('keydown', onQuestion);
    return () => window.removeEventListener('keydown', onQuestion);
  }, []);

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

  return helpOpen ? (
    <KeyboardShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
  ) : null;
}

export function keyboardShortcutHelp(): string {
  return loadKeyboardShortcuts()
    .map(entry => `${entry.combo}: ${keyboardShortcutActionLabel(entry.action)}`)
    .join(' · ');
}
