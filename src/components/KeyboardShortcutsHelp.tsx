'use client';

import { usePathname } from 'next/navigation';
import Dialog from '@/components/ui/Dialog';
import { pageShortcuts } from '@/lib/app/page-shortcuts';
import {
  keyboardShortcutActionLabel,
  loadKeyboardShortcuts,
} from '@/lib/app/keyboard-shortcuts-store';

/** "Ctrl+Alt+C" → "⌘/Ctrl+Alt+C" (Ctrl bindings also take ⌘). */
function comboLabel(combo: string): string {
  return combo.replace(/\bCtrl\b/g, '⌘/Ctrl');
}

export default function KeyboardShortcutsHelp({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const bindings = open ? loadKeyboardShortcuts() : [];
  // This page's own keys first (2026-11-05: they were only in tooltips and the guides).
  const page = pageShortcuts(usePathname());
  const hasPaletteBinding = bindings.some(binding => binding.action === 'command-palette');

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description="Ctrl bindings also accept ⌘ on macOS (with Alt, use Control: ⌘+Option is the browser’s)."
      // Opened from the command palette, so it stacks over it.
      layer="dialogRaised"
      testId="keyboard-shortcuts"
      bodyClassName="min-h-0 flex-1 overflow-y-auto border-t border-[var(--border-subtle)] px-5 py-3"
      footer={
        <p className="type-caption mr-auto text-[var(--text-muted)]">
          Press ? on any page to see this. The command palette (⌘/Ctrl+K) also runs the open page’s
          actions and finds any setting. Change these combos under Profile → Keyboard shortcuts.
        </p>
      }
    >
      {page ? (
        <section className="mb-4 space-y-2" data-testid="keyboard-shortcuts-page">
          <h3 className="type-overline text-[var(--text-muted)]">On {page.page}</h3>
          <ul className="space-y-2">
            {page.keys.map(entry => (
              <li key={entry.keys} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-[var(--text-secondary)]">{entry.does}</span>
                <kbd className="shrink-0 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2 py-1 type-caption text-[var(--text-primary)]">
                  {entry.keys}
                </kbd>
              </li>
            ))}
          </ul>
          <h3 className="type-overline pt-2 text-[var(--text-muted)]">Everywhere</h3>
        </section>
      ) : null}
      <ul className="max-h-[50vh] space-y-2">
        {bindings.map(binding => (
          <li key={binding.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-[var(--text-secondary)]">
              {keyboardShortcutActionLabel(binding.action)}
            </span>
            <kbd className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2 py-1 type-caption text-[var(--text-primary)]">
              {comboLabel(binding.combo)}
            </kbd>
          </li>
        ))}
        {hasPaletteBinding ? null : (
          <li className="flex items-center justify-between gap-3 text-sm">
            <span className="text-[var(--text-secondary)]">
              {keyboardShortcutActionLabel('command-palette')}
            </span>
            <kbd className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2 py-1 type-caption text-[var(--text-primary)]">
              ⌘/Ctrl+K
            </kbd>
          </li>
        )}
      </ul>
    </Dialog>
  );
}
