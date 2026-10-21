import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';

export type KeyboardShortcutBinding = {
  id: string;
  combo: string;
  action: string;
  selector?: string;
};

/** What each action does, for the cheat sheet (bindings store the action id). */
export const KEYBOARD_SHORTCUT_ACTION_LABELS: Record<string, string> = {
  'primary-generate': 'Generate',
  'copy-pair': 'Copy prompt pair',
  'send-comfyui': 'Queue to ComfyUI',
  'command-palette': 'Command palette',
};

export function keyboardShortcutActionLabel(action: string): string {
  return KEYBOARD_SHORTCUT_ACTION_LABELS[action] ?? action;
}

export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcutBinding[] = [
  {
    id: 'generate',
    combo: 'Ctrl+Enter',
    action: 'primary-generate',
    selector: "[data-action='primary-generate']",
  },
  {
    id: 'copy-pair',
    // Was Ctrl+Shift+C: the browser's inspect-element took it first.
    combo: 'Ctrl+Alt+C',
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

/**
 * Old default combos that clash with the browser, by binding id, and what they became. A stored
 * binding still on the old default moves to the new one; one the player changed is left alone.
 */
const RETIRED_DEFAULT_COMBOS: Record<string, { from: string; to: string }> = {
  'copy-pair': { from: 'Ctrl+Shift+C', to: 'Ctrl+Alt+C' },
};

function sameCombo(a: string, b: string): boolean {
  const left = parseCombo(a);
  const right = parseCombo(b);
  return (
    left.ctrl === right.ctrl &&
    left.shift === right.shift &&
    left.alt === right.alt &&
    left.key === right.key
  );
}

/** Move bindings still on a retired default combo to its replacement. */
export function migrateKeyboardShortcuts(bindings: KeyboardShortcutBinding[]): {
  bindings: KeyboardShortcutBinding[];
  changed: boolean;
} {
  let changed = false;
  const next = bindings.map(binding => {
    const retired = RETIRED_DEFAULT_COMBOS[binding.id];
    if (retired && sameCombo(binding.combo, retired.from)) {
      changed = true;
      return { ...binding, combo: retired.to };
    }
    return binding;
  });
  return { bindings: changed ? next : bindings, changed };
}

export function loadKeyboardShortcuts(): KeyboardShortcutBinding[] {
  if (typeof window === 'undefined') {
    return DEFAULT_KEYBOARD_SHORTCUTS;
  }
  const stored = readBrowserValue<KeyboardShortcutBinding[]>(KEY);
  if (!Array.isArray(stored)) {
    return DEFAULT_KEYBOARD_SHORTCUTS;
  }
  const migrated = migrateKeyboardShortcuts(stored);
  if (migrated.changed) {
    writeBrowserValue(KEY, migrated.bindings);
  }
  return migrated.bindings;
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
  alt: boolean;
  key: string;
} {
  const parts = combo.split('+').map(part => part.trim());
  const has = (...names: string[]) => parts.some(part => names.includes(part.toLowerCase()));
  return {
    ctrl: has('ctrl', 'cmd'),
    shift: has('shift'),
    alt: has('alt', 'option', 'opt'),
    key: parts[parts.length - 1]?.toLowerCase() ?? '',
  };
}

/**
 * Does this key event press the combo? Ctrl also matches ⌘. Letters match by physical key too
 * (`code`), because Alt/Option changes `key` ("ç" for Option+C on a Mac).
 */
export function comboMatchesEvent(
  combo: ReturnType<typeof parseCombo>,
  event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'key' | 'code'>
): boolean {
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl !== combo.ctrl || event.shiftKey !== combo.shift || event.altKey !== combo.alt) {
    return false;
  }
  const key = (event.key ?? '').toLowerCase();
  if (key === combo.key) return true;
  return /^[a-z]$/.test(combo.key) && event.code === `Key${combo.key.toUpperCase()}`;
}
