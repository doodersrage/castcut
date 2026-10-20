import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

let chatCompletionImpl: (options: unknown) => Promise<string> = async () => 'llm output prompt.';
const chatCompletion = mock.fn((options: unknown) => chatCompletionImpl(options));
mock.module('../llm/client', { namedExports: { chatCompletion } });

describe('prompt-formatter', async () => {
  const { formatPrompt, normalizeFormatSettings } = await import('./formatter');

  const originalLlmEnabled = process.env.LLM_ENABLED;
  const originalFallback = process.env.ALLOW_TEMPLATE_FALLBACK;

  beforeEach(() => {
    chatCompletion.mock.resetCalls();
    chatCompletionImpl = async () => 'llm output prompt.';
    delete process.env.LLM_ENABLED;
    delete process.env.ALLOW_TEMPLATE_FALLBACK;
  });

  afterEach(() => {
    if (originalLlmEnabled === undefined) {
      delete process.env.LLM_ENABLED;
    } else {
      process.env.LLM_ENABLED = originalLlmEnabled;
    }
    if (originalFallback === undefined) {
      delete process.env.ALLOW_TEMPLATE_FALLBACK;
    } else {
      process.env.ALLOW_TEMPLATE_FALLBACK = originalFallback;
    }
  });

  describe('normalizeFormatSettings', () => {
    it('fills in every default for a null/undefined input', () => {
      const result = normalizeFormatSettings();
      assert.equal(result.detail, 'balanced');
      assert.equal(result.mode, 'positive');
      assert.equal(result.smartFormat, true);
      assert.ok(result.model.length > 0);
    });

    it('falls back to the default model for an unknown model id', () => {
      const result = normalizeFormatSettings({ model: 'not-a-real-model' });
      assert.notEqual(result.model, 'not-a-real-model');
    });

    it('only accepts the literal "negative" for mode, defaulting anything else to positive', () => {
      assert.equal(normalizeFormatSettings({ mode: 'negative' }).mode, 'negative');
      assert.equal(normalizeFormatSettings({ mode: 'bogus' as never }).mode, 'positive');
    });

    it('coerces a non-boolean smartFormat to the default (true)', () => {
      assert.equal(normalizeFormatSettings({ smartFormat: false }).smartFormat, false);
      assert.equal(normalizeFormatSettings({ smartFormat: 'yes' as never }).smartFormat, true);
    });
  });

  describe('formatPrompt', () => {
    it('rejects an empty (or whitespace-only) input', async () => {
      await assert.rejects(() => formatPrompt('   '), /Input cannot be empty/);
    });

    it('uses the rules path (no chatCompletion call) when smartFormat is false', async () => {
      const result = await formatPrompt('a cat in a garden', {
        model: 'sdxl',
        detail: 'balanced',
        mode: 'positive',
        smartFormat: false,
      });
      assert.equal(result.provider, 'rules');
      assert.equal(chatCompletion.mock.calls.length, 0);
      assert.ok(result.prompt.length > 0);
      assert.equal(result.inputChars, 'a cat in a garden'.length);
      assert.equal(result.outputChars, result.prompt.length);
      assert.equal(result.rawPrompt, undefined);
    });

    it('uses the rules path when LLM_ENABLED=false, even with smartFormat true', async () => {
      process.env.LLM_ENABLED = 'false';
      const result = await formatPrompt('a cat in a garden', {
        model: 'sdxl',
        detail: 'balanced',
        mode: 'positive',
        smartFormat: true,
      });
      assert.equal(result.provider, 'rules');
      assert.equal(chatCompletion.mock.calls.length, 0);
    });

    it('uses the llm path when smartFormat is true and LLM_ENABLED is unset, returning provider "llm" with a rawPrompt', async () => {
      chatCompletionImpl = async () => 'A garden scene with a cat lounging in the sun.';
      const result = await formatPrompt('cat garden', {
        model: 'sdxl',
        detail: 'balanced',
        mode: 'positive',
        smartFormat: true,
      });
      assert.equal(result.provider, 'llm');
      assert.equal(chatCompletion.mock.calls.length, 1);
      assert.ok(result.rawPrompt && result.rawPrompt.length > 0);
      assert.ok(result.prompt.length > 0);
    });

    it('passes maxTokens/temperature/extraBody derived from settings into chatCompletion', async () => {
      await formatPrompt('cat garden', {
        model: 'sdxl',
        detail: 'balanced',
        mode: 'positive',
        smartFormat: true,
      });
      const arg = chatCompletion.mock.calls[0]!.arguments[0] as {
        temperature: number;
        maxTokens: number;
        extraBody: Record<string, unknown>;
        messages: Array<{ role: string; content: string }>;
      };
      assert.equal(arg.temperature, 0.4);
      assert.ok(arg.maxTokens > 0);
      assert.deepEqual(arg.extraBody, { top_p: 0.9 });
      assert.equal(arg.messages.length, 2);
      assert.equal(arg.messages[0]!.role, 'system');
      assert.equal(arg.messages[1]!.role, 'user');
      assert.ok(arg.messages[1]!.content.includes('cat garden'));
    });

    it('falls back to the rules path when chatCompletion throws and fallback is allowed (default)', async () => {
      chatCompletionImpl = async () => {
        throw new Error('llm unavailable');
      };
      const result = await formatPrompt('cat garden', {
        model: 'sdxl',
        detail: 'balanced',
        mode: 'positive',
        smartFormat: true,
      });
      assert.equal(result.provider, 'rules');
    });

    it('falls back to the rules path when chatCompletion throws a non-Error value', async () => {
      chatCompletionImpl = async () => {
         
        throw 'a plain string failure';
      };
      const result = await formatPrompt('cat garden', {
        model: 'sdxl',
        detail: 'balanced',
        mode: 'positive',
        smartFormat: true,
      });
      assert.equal(result.provider, 'rules');
    });

    it('includes the FLUX-ignores-negatives note in the system prompt for negative mode on a FLUX model', async () => {
      await formatPrompt('cat garden', {
        model: 'flux-2-klein',
        detail: 'balanced',
        mode: 'negative',
        smartFormat: true,
      });
      const arg = chatCompletion.mock.calls[0]!.arguments[0] as {
        messages: Array<{ role: string; content: string }>;
      };
      assert.ok(arg.messages[0]!.content.includes('FLUX ignores negatives'));
    });

    it('falls back to the rules path when the LLM returns only reasoning/empty content', async () => {
      chatCompletionImpl = async () => '   ';
      const result = await formatPrompt('cat garden', {
        model: 'sdxl',
        detail: 'balanced',
        mode: 'positive',
        smartFormat: true,
      });
      assert.equal(result.provider, 'rules');
    });

    it('rethrows the LLM error when ALLOW_TEMPLATE_FALLBACK=false', async () => {
      process.env.ALLOW_TEMPLATE_FALLBACK = 'false';
      chatCompletionImpl = async () => {
        throw new Error('llm unavailable');
      };
      await assert.rejects(
        () =>
          formatPrompt('cat garden', {
            model: 'sdxl',
            detail: 'balanced',
            mode: 'positive',
            smartFormat: true,
          }),
        /llm unavailable/
      );
    });

    it('builds limits/comfyNode from the resolved model and settings.detail', async () => {
      const result = await formatPrompt('a cat in a garden', {
        model: 'sdxl',
        detail: 'balanced',
        mode: 'positive',
        smartFormat: false,
      });
      assert.ok(result.comfyNode.length > 0);
      assert.ok(result.limits.maxChars > 0);
      assert.ok(result.limits.maxSentences > 0);
      assert.ok(result.limits.maxTokens > 0);
    });

    it('defaults settings entirely when none are given', async () => {
      const result = await formatPrompt('a cat in a garden');
      assert.equal(result.mode, 'positive');
      assert.ok(result.model.length > 0);
    });
  });
});
