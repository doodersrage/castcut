import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';

export type KeyboardShortcutBinding = {
  id: string;
  combo: string;
  action: string;
  selector?: string;
};

export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcutBinding[] = [
  {
    id: 'generate',
    combo: 'Ctrl+Enter',
    action: 'primary-generate',
    selector: "[data-action='primary-generate']",
  },
  {
    id: 'copy-pair',
    combo: 'Ctrl+Shift+C',
    action: 'copy-pair',
    selector: "[data-action='copy-pair']",
  },
  {
    id: 'queue',
    combo: 'Ctrl+Shift+G',
    action: 'send-comfyui',
    selector: "[data-action='send-comfyui']",
  },
  { id: 'palette', combo: 'Ctrl+K', action: 'command-palette' },
];

const KEY = 'comfy-keyboard-shortcuts-v1';

export function loadKeyboardShortcuts(): KeyboardShortcutBinding[] {
  if (typeof window === 'undefined') {
    return DEFAULT_KEYBOARD_SHORTCUTS;
  }
  return readBrowserValue<KeyboardShortcutBinding[]>(KEY) ?? DEFAULT_KEYBOARD_SHORTCUTS;
}

export function saveKeyboardShortcuts(bindings: KeyboardShortcutBinding[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(KEY, bindings);
}

export function parseCombo(combo: string): {
  ctrl: boolean;
  shift: boolean;
  key: string;
} {
  const parts = combo.split('+').map(part => part.trim());
  return {
    ctrl: parts.some(part => part.toLowerCase() === 'ctrl' || part.toLowerCase() === 'cmd'),
    shift: parts.some(part => part.toLowerCase() === 'shift'),
    key: parts[parts.length - 1]?.toLowerCase() ?? '',
  };
}
