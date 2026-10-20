import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyPromptEncodeBinding,
  isPromptEncodeNode,
  resolvePromptEncodeTextField,
  setPromptEncodeField,
} from './prompt-encode';

describe('workflow-prompt-encode', () => {
  describe('isPromptEncodeNode', () => {
    it('recognizes CLIPTextEncode (any case)', () => {
      assert.equal(isPromptEncodeNode('CLIPTextEncode'), true);
      assert.equal(isPromptEncodeNode('cliptextencode'), true);
    });

    it('recognizes any class type containing "textencode"', () => {
      assert.equal(isPromptEncodeNode('CustomTextEncodeNode'), true);
    });

    it('returns false for unrelated node types', () => {
      assert.equal(isPromptEncodeNode('KSampler'), false);
      assert.equal(isPromptEncodeNode('SaveImage'), false);
    });
  });

  describe('resolvePromptEncodeTextField', () => {
    it('prefers "text" when both text and prompt keys are present', () => {
      assert.equal(resolvePromptEncodeTextField({ text: 'a', prompt: 'b' }), 'text');
    });

    it('returns "prompt" when only prompt is present', () => {
      assert.equal(resolvePromptEncodeTextField({ prompt: 'b' }), 'prompt');
    });

    it('returns "text" when only text is present', () => {
      assert.equal(resolvePromptEncodeTextField({ text: 'a' }), 'text');
    });

    it('returns null when neither key is present', () => {
      assert.equal(resolvePromptEncodeTextField({ other: 'x' }), null);
    });
  });

  describe('classifyPromptEncodeBinding', () => {
    it('returns "unknown" for a non-prompt-encode node regardless of title', () => {
      assert.equal(classifyPromptEncodeBinding('KSampler', 'Positive Prompt'), 'unknown');
    });

    it('classifies a title containing "negative" as negative', () => {
      assert.equal(classifyPromptEncodeBinding('CLIPTextEncode', 'Negative Prompt'), 'negative');
    });

    it('classifies a title containing " neg" (space-delimited) as negative', () => {
      // NOTE: the source checks the literal substring " neg" (a space immediately
      // followed by "neg"), so a title like "CLIP Text Encode (neg)" does NOT match
      // ("(" sits between the space and "neg") -- it falls through to the
      // "prompt"/default positive branch instead. A title with an unadorned " neg"
      // substring is what actually exercises this branch.
      assert.equal(classifyPromptEncodeBinding('CLIPTextEncode', 'CLIP Text Encode neg'), 'negative');
    });

    it('does NOT classify a parenthesized "(neg)" as negative, since " neg" is not a contiguous substring', () => {
      assert.equal(classifyPromptEncodeBinding('CLIPTextEncode', 'CLIP Text Encode (neg)'), 'positive');
    });

    it('classifies a title containing "positive" as positive', () => {
      assert.equal(classifyPromptEncodeBinding('CLIPTextEncode', 'Positive Prompt'), 'positive');
    });

    it('classifies a title containing "prompt" (without "negative") as positive', () => {
      assert.equal(classifyPromptEncodeBinding('CLIPTextEncode', 'Main Prompt'), 'positive');
    });

    it('defaults to positive when the title gives no signal either way', () => {
      assert.equal(classifyPromptEncodeBinding('CLIPTextEncode', 'CLIP Text Encode'), 'positive');
    });

    it('is case-insensitive when reading the title', () => {
      assert.equal(classifyPromptEncodeBinding('CLIPTextEncode', 'NEGATIVE'), 'negative');
    });
  });

  describe('setPromptEncodeField', () => {
    it('sets the "text" field on the inputs object', () => {
      const inputs: Record<string, unknown> = {};
      setPromptEncodeField(inputs, 'text', 'a fox in a forest');
      assert.equal(inputs.text, 'a fox in a forest');
    });

    it('sets the "prompt" field on the inputs object', () => {
      const inputs: Record<string, unknown> = { prompt: 'old value' };
      setPromptEncodeField(inputs, 'prompt', 'new value');
      assert.equal(inputs.prompt, 'new value');
    });

    it('mutates the inputs object in place rather than returning a new one', () => {
      const inputs: Record<string, unknown> = {};
      const result = setPromptEncodeField(inputs, 'text', 'x');
      assert.equal(result, undefined);
      assert.equal(inputs.text, 'x');
    });
  });
});
