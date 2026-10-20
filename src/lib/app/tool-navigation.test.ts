import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveHistoryEntryNavigation, extractHintsFromHistoryEntry } from './tool-navigation';
import type { PromptHistoryEntry } from '@/lib/prompt/history';

function entry(overrides: Partial<PromptHistoryEntry> & { tool: string }): PromptHistoryEntry {
  return {
    id: 'e1',
    prompt: 'a prompt',
    model: 'sdxl',
    timestamp: 1,
    ...overrides,
  } as PromptHistoryEntry;
}

describe('tool-navigation', () => {
  describe('resolveHistoryEntryNavigation', () => {
    it('routes the legacy scene-compose tool id to Character with compose mode', () => {
      const result = resolveHistoryEntryNavigation(entry({ tool: 'scene-compose' }));
      assert.deepEqual(result, { path: '/character', mode: 'compose' });
    });

    it('routes the compose tool to /compose with no mode', () => {
      const result = resolveHistoryEntryNavigation(entry({ tool: 'compose' }));
      assert.deepEqual(result, { path: '/compose' });
    });

    it('routes the duo tool to Character with duo mode', () => {
      const result = resolveHistoryEntryNavigation(entry({ tool: 'duo' }));
      assert.deepEqual(result, { path: '/character', mode: 'duo' });
    });

    it('routes an entry with inferred duoMode diagnostics to Character with duo mode', () => {
      const result = resolveHistoryEntryNavigation(
        entry({
          tool: 'generate',
          diagnostics: { inferred: { duoMode: true } } as never,
        })
      );
      assert.deepEqual(result, { path: '/character', mode: 'duo' });
    });

    it('routes the character tool to Character with solo mode', () => {
      const result = resolveHistoryEntryNavigation(entry({ tool: 'character' }));
      assert.deepEqual(result, { path: '/character', mode: 'solo' });
    });

    it('routes a known tool id via the static TOOL_PATHS table', () => {
      assert.deepEqual(resolveHistoryEntryNavigation(entry({ tool: 'video' })), { path: '/video' });
      assert.deepEqual(resolveHistoryEntryNavigation(entry({ tool: 'pet' })), { path: '/pet' });
      assert.deepEqual(resolveHistoryEntryNavigation(entry({ tool: 'nsfw-generator' })), {
        path: '/plugins/nsfw-generator',
      });
    });

    it('falls back to / for an unknown tool id', () => {
      assert.deepEqual(resolveHistoryEntryNavigation(entry({ tool: 'some-unknown-tool' })), {
        path: '/',
      });
    });
  });

  describe('extractHintsFromHistoryEntry', () => {
    it('returns trimmed hints when present', () => {
      const result = extractHintsFromHistoryEntry(entry({ tool: 'generate', hints: '  a hint  ' }));
      assert.equal(result, 'a hint');
    });

    it('falls back to the first 500 chars of the prompt for generate/randomScene/nsfw-generator', () => {
      const longPrompt = 'x'.repeat(600);
      for (const tool of ['generate', 'randomScene', 'nsfw-generator']) {
        const result = extractHintsFromHistoryEntry(entry({ tool, prompt: longPrompt }));
        assert.equal(result.length, 500);
      }
    });

    it('falls back to the first 400 chars of the prompt for any other tool', () => {
      const longPrompt = 'y'.repeat(600);
      const result = extractHintsFromHistoryEntry(entry({ tool: 'character', prompt: longPrompt }));
      assert.equal(result.length, 400);
    });

    it('treats blank hints as absent and falls back to the prompt', () => {
      const result = extractHintsFromHistoryEntry(
        entry({ tool: 'character', hints: '   ', prompt: 'fallback prompt' })
      );
      assert.equal(result, 'fallback prompt');
    });
  });
});
