import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyLlmModelKind,
  filterOpenRouterFreeEntries,
  groupLlmCatalogEntries,
  parseLlmCatalogEntries,
} from './providers';
import {
  isAnthropicLlmBaseUrl,
  isOllamaLlmBaseUrl,
  parseOllamaTagModels,
  parseOpenAiCompatibleModels,
} from './models';

describe('parseOpenAiCompatibleModels', () => {
  it('reads ids from OpenAI / LM Studio / OpenRouter payloads', () => {
    assert.deepEqual(
      parseOpenAiCompatibleModels({
        data: [
          { id: 'nsfwvision-qwen3-vl-8b-v3', object: 'model' },
          { id: '  llama-3.1-8b  ' },
          { id: 'nsfwvision-qwen3-vl-8b-v3' },
          { object: 'model' },
        ],
      }),
      ['llama-3.1-8b', 'nsfwvision-qwen3-vl-8b-v3']
    );
  });

  it('reads Anthropic data[].id the same way', () => {
    assert.deepEqual(
      parseOpenAiCompatibleModels({
        data: [{ id: 'claude-sonnet-4-20250514', display_name: 'Claude Sonnet 4' }],
      }),
      ['claude-sonnet-4-20250514']
    );
  });

  it('returns empty for junk', () => {
    assert.deepEqual(parseOpenAiCompatibleModels(null), []);
    assert.deepEqual(parseOpenAiCompatibleModels({ data: 'nope' }), []);
  });
});

describe('parseOllamaTagModels', () => {
  it('reads name/model from /api/tags', () => {
    assert.deepEqual(
      parseOllamaTagModels({
        models: [{ name: 'qwen3-vl:latest' }, { model: 'nomic-embed-text:latest' }, { name: '' }],
      }),
      ['nomic-embed-text:latest', 'qwen3-vl:latest']
    );
  });

  it('strips Gemini models/ prefixes when name is used', () => {
    assert.deepEqual(parseOllamaTagModels({ models: [{ name: 'models/gemini-1.5-pro' }] }), [
      'gemini-1.5-pro',
    ]);
  });
});

describe('LLM catalog metadata', () => {
  it('classifies vision, embed, and text ids', () => {
    assert.equal(classifyLlmModelKind('qwen3-vl:latest'), 'vision');
    assert.equal(classifyLlmModelKind('nomic-embed-text'), 'embed');
    assert.equal(classifyLlmModelKind('llama-3.1-8b'), 'text');
    assert.equal(
      classifyLlmModelKind('openai/gpt-4o-mini', { modality: 'text+image->text' }),
      'vision'
    );
  });

  it('keeps OpenRouter context, pricing, and groups', () => {
    const entries = parseLlmCatalogEntries({
      data: [
        {
          id: 'meta-llama/llama-3.2-3b-instruct:free',
          context_length: 131072,
          pricing: { prompt: '0', completion: '0' },
        },
        {
          id: 'google/gemini-flash-1.5',
          architecture: { modality: 'text+image->text' },
          pricing: { prompt: '0.0001', completion: '0.0004' },
        },
        {
          id: 'openai/text-embedding-3-small',
        },
      ],
    });
    assert.equal(entries.find(entry => entry.id.endsWith(':free'))?.free, true);
    assert.equal(entries.find(entry => entry.id.includes('gemini'))?.kind, 'vision');
    assert.equal(entries.find(entry => entry.id.includes('embedding'))?.kind, 'embed');
    const grouped = groupLlmCatalogEntries(entries);
    assert.equal(grouped.vision.length, 1);
    assert.equal(grouped.embed.length, 1);
    assert.equal(grouped.text.length, 1);
    assert.equal(filterOpenRouterFreeEntries(entries).length, 1);
  });
});

describe('LLM base URL heuristics', () => {
  it('detects Ollama and Anthropic hosts', () => {
    assert.equal(isOllamaLlmBaseUrl('http://localhost:11434/v1'), true);
    assert.equal(isOllamaLlmBaseUrl('https://ollama.com'), true);
    assert.equal(isOllamaLlmBaseUrl('http://127.0.0.1:1234/v1'), false);
    assert.equal(isAnthropicLlmBaseUrl('https://api.anthropic.com/v1'), true);
    assert.equal(isAnthropicLlmBaseUrl('http://127.0.0.1:1234/v1'), false);
  });
});
