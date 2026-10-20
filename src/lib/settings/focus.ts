/**
 * Scroll to and briefly highlight a Settings control named in a `focus` deep link (element id
 * or test id), opening any folded <details> around it. Retries while the tab renders.
 */

const HIGHLIGHT = [
  'ring-2',
  'ring-[var(--accent-ring)]',
  'ring-offset-2',
  'ring-offset-[var(--bg-base)]',
  'transition',
];

function findTarget(key: string): HTMLElement | null {
  const byId = document.getElementById(key);
  if (byId) return byId;
  try {
    return document.querySelector<HTMLElement>(`[data-testid="${CSS.escape(key)}"]`);
  } catch {
    return null;
  }
}

export function focusSettingsElement(key: string, attempts = 12): void {
  if (typeof document === 'undefined' || !key.trim()) return;
  const target = findTarget(key.trim());
  if (!target) {
    if (attempts > 0) window.setTimeout(() => focusSettingsElement(key, attempts - 1), 200);
    return;
  }
  for (
    let folded = target.closest('details');
    folded;
    folded = folded.parentElement?.closest('details') ?? null
  ) {
    folded.open = true;
  }
  // A bare checkbox or input highlights better through its label.
  const shown = (target.tagName === 'INPUT' ? target.closest('label') : null) ?? target;
  shown.scrollIntoView({ behavior: 'smooth', block: 'center' });
  shown.classList.add(...HIGHLIGHT);
  window.setTimeout(() => shown.classList.remove(...HIGHLIGHT), 2600);
}
