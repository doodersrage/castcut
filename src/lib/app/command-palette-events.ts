/** Opens the command palette from anywhere (the sidebar's Search button), as ⌘K / Ctrl+K does. */
export const COMMAND_PALETTE_OPEN_EVENT = 'castcut-command-palette-open';

export function openCommandPalette(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(COMMAND_PALETTE_OPEN_EVENT));
}

/** The shortcut as this keyboard writes it: ⌘K on a Mac, Ctrl K elsewhere. */
export function commandPaletteShortcutLabel(platform: string | undefined): string {
  return /mac|iphone|ipad/i.test(platform ?? '') ? '⌘K' : 'Ctrl K';
}
