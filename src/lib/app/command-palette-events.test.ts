import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { commandPaletteShortcutLabel } from './command-palette-events';

describe('the command palette shortcut, as this keyboard writes it', () => {
  it('⌘K on a Mac, Ctrl K elsewhere', () => {
    assert.equal(commandPaletteShortcutLabel('MacIntel'), '⌘K');
    assert.equal(commandPaletteShortcutLabel('Linux x86_64'), 'Ctrl K');
    assert.equal(commandPaletteShortcutLabel(undefined), 'Ctrl K');
  });
});
