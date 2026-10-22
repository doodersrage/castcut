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

/** How long after opening the target we check it is still the one on the page. */
const RECHECK_MS = 400;

/**
 * The copy on the page. Settings tabs are streamed from the server: when the browser renders a
 * tab first, the server's late copy of it waits in a hidden `<div hidden id="S:…">` until React
 * removes it, and the same id is in the document twice. Opening that copy's folds did nothing
 * the user could see.
 */
function findTarget(key: string): HTMLElement | null {
  let matches: HTMLElement[];
  try {
    matches = Array.from(
      document.querySelectorAll<HTMLElement>(
        `[id="${CSS.escape(key)}"], [data-testid="${CSS.escape(key)}"]`
      )
    );
  } catch {
    return null;
  }
  return matches.find(element => !element.closest('[hidden]')) ?? null;
}

export function focusSettingsElement(key: string, attempts = 25): void {
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
  // The tab can still be swapped for a fresh render (folded again) just after we opened it:
  // if our element left the page, open the one that replaced it.
  window.setTimeout(() => {
    if (!target.isConnected && attempts > 0) focusSettingsElement(key, attempts - 1);
  }, RECHECK_MS);
}
