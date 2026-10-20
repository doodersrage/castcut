'use client';

import { loadKeyboardShortcuts } from '@/lib/app/keyboard-shortcuts-store';

export default function KeyboardShortcutsHelp({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  const bindings = loadKeyboardShortcuts();

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[rgb(0_0_0_/0.55)] px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
        className="w-full max-w-md overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-default)] bg-[var(--bg-muted)] shadow-[var(--shadow-card)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
          <div>
            <h2 id="keyboard-shortcuts-title" className="type-heading">
              Keyboard shortcuts
            </h2>
            <p className="type-caption mt-1 text-[var(--text-muted)]">
              Ctrl bindings also accept ⌘ on macOS.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close shortcuts"
            className="type-caption rounded-[var(--radius-md)] px-2 py-1 text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto px-4 py-3">
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
        <div className="border-t border-[var(--border-subtle)] px-4 py-2 type-caption text-[var(--text-muted)]">
          Tip: open the command palette (⌘/Ctrl+K) for Resume draft, Continue where you left off,
          and Dismiss continue. Customize bindings under Settings when available.
        </div>
      </div>
      <button
        type="button"
        aria-label="Close shortcuts overlay"
        className="absolute inset-0 -z-10"
        onClick={onClose}
      />
    </div>
  );
}
