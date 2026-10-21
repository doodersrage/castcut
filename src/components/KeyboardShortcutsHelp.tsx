'use client';

import Dialog from '@/components/ui/Dialog';
import { loadKeyboardShortcuts } from '@/lib/app/keyboard-shortcuts-store';

export default function KeyboardShortcutsHelp({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const bindings = open ? loadKeyboardShortcuts() : [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description="Ctrl bindings also accept ⌘ on macOS."
      // Opened from the command palette, so it stacks over it.
      layer="dialogRaised"
      testId="keyboard-shortcuts"
      bodyClassName="min-h-0 flex-1 overflow-y-auto border-t border-[var(--border-subtle)] px-5 py-3"
      footer={
        <p className="type-caption mr-auto text-[var(--text-muted)]">
          Tip: open the command palette (⌘/Ctrl+K) for Resume draft, Continue where you left off,
          and Dismiss continue. Customize bindings under Settings when available.
        </p>
      }
    >
      <ul className="max-h-[50vh] space-y-2">
        {bindings.map(binding => (
          <li key={binding.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-[var(--text-secondary)]">{binding.action}</span>
            <kbd className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2 py-1 type-caption text-[var(--text-primary)]">
              {binding.combo.replace(/Ctrl/g, '⌘/Ctrl')}
            </kbd>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 text-sm">
          <span className="text-[var(--text-secondary)]">command-palette</span>
          <kbd className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2 py-1 type-caption text-[var(--text-primary)]">
            ⌘/Ctrl+K
          </kbd>
        </li>
      </ul>
    </Dialog>
  );
}
