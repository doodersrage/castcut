import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getLlmConfig, getVisionModel } from "./llm-client";

describe("llm-client config resolution", () => {
  const originalBaseUrl = process.env.LLM_API_BASE_URL;
  const originalApiKey = process.env.LLM_API_KEY;
  const originalModel = process.env.LLM_MODEL;
  const originalVisionModel = process.env.LLM_VISION_MODEL;

  function restore(key: string, original: string | undefined) {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }

  afterEach(() => {
    restore("LLM_API_BASE_URL", originalBaseUrl);
    restore("LLM_API_KEY", originalApiKey);
    restore("LLM_MODEL", originalModel);
    restore("LLM_VISION_MODEL", originalVisionModel);
  });

  describe("getLlmConfig", () => {
    it("falls back to Ollama-compatible defaults when nothing is configured", () => {
      delete process.env.LLM_API_BASE_URL;
      delete process.env.LLM_API_KEY;
      delete process.env.LLM_MODEL;
      delete process.env.LLM_VISION_MODEL;

      const config = getLlmConfig();
      assert.equal(config.baseUrl, "http://localhost:11434/v1");
      assert.equal(config.apiKey, "");
      assert.equal(config.model, "dolphin-llama3");
      // With no vision model configured, it falls back to the text model.
      assert.equal(config.visionModel, config.model);
    });

    it("reads base URL, key, and model from environment variables and strips a trailing slash", () => {
      process.env.LLM_API_BASE_URL = "https://llm.example.com/v1/";
      process.env.LLM_API_KEY = "env-key";
      process.env.LLM_MODEL = "qwen3:latest";
      delete process.env.LLM_VISION_MODEL;

      const config = getLlmConfig();
      assert.equal(config.baseUrl, "https://llm.example.com/v1");
      assert.equal(config.apiKey, "env-key");
      assert.equal(config.model, "qwen3:latest");
      // Vision model falls back to the text model when unset.
      assert.equal(config.visionModel, "qwen3:latest");
    });

    it("prefers an explicit vision model over the text model fallback", () => {
      process.env.LLM_MODEL = "qwen3:latest";
      process.env.LLM_VISION_MODEL = "qwen3-vl:latest";

      const config = getLlmConfig();
      assert.equal(config.visionModel, "qwen3-vl:latest");
    });

    it("lets a request-scoped override take precedence over environment variables", () => {
      process.env.LLM_API_BASE_URL = "https://env.example.com/v1";
      process.env.LLM_API_KEY = "env-key";

      const config = getLlmConfig({
        baseUrl: "https://override.example.com/v1/",
        apiKey: "override-key",
      });
      assert.equal(config.baseUrl, "https://override.example.com/v1");
      assert.equal(config.apiKey, "override-key");
    });

    it("falls back to the environment key when the override key is blank", () => {
      process.env.LLM_API_KEY = "env-key";
      const config = getLlmConfig({ apiKey: "   " });
      assert.equal(config.apiKey, "env-key");
    });
  });

  describe("getVisionModel", () => {
    it("returns a trimmed request-scoped override when provided", () => {
      assert.equal(getVisionModel("  qwen3-vl:latest  "), "qwen3-vl:latest");
    });

    it("falls back to the LLM_VISION_MODEL environment variable", () => {
      process.env.LLM_VISION_MODEL = "qwen3-vl:latest";
      assert.equal(getVisionModel(), "qwen3-vl:latest");
    });

    it("ignores a blank override and falls back to the environment variable", () => {
      process.env.LLM_VISION_MODEL = "qwen3-vl:latest";
      assert.equal(getVisionModel("   "), "qwen3-vl:latest");
    });

    it("throws a descriptive error when no vision model is configured anywhere, even if LLM_MODEL is set", () => {
      delete process.env.LLM_VISION_MODEL;
      process.env.LLM_MODEL = "dolphin-llama3";
      assert.throws(() => getVisionModel(), /LLM_VISION_MODEL is not set/);
    });
  });
});

describe('llmErrorDetail', () => {
  it('digs the reason out of provider JSON nested in strings', async () => {
    const { llmErrorDetail } = await import('./llm-client');
    const lmStudio = JSON.stringify({
      error:
        'Engine protocol predict request returned 400: ' +
        JSON.stringify({ error: { code: 400, message: 'Failed to load image or audio file' } }),
    });
    assert.equal(llmErrorDetail(lmStudio), 'Failed to load image or audio file');
    assert.equal(
      llmErrorDetail(JSON.stringify({ error: { message: 'model not found' } })),
      'model not found'
    );
    assert.equal(llmErrorDetail('Bad Gateway'), 'Bad Gateway');
  });
});

describe('transient LLM failures', () => {
  async function withFetch(
    replies: () => Response,
    run: () => Promise<void>
  ): Promise<void> {
    const originalFetch = globalThis.fetch;
    const originalBase = process.env.LLM_API_BASE_URL;
    process.env.LLM_API_BASE_URL = 'http://127.0.0.1:1234/v1';
    globalThis.fetch = (async () => replies()) as typeof fetch;
    try {
      await run();
    } finally {
      globalThis.fetch = originalFetch;
      if (originalBase === undefined) delete process.env.LLM_API_BASE_URL;
      else process.env.LLM_API_BASE_URL = originalBase;
    }
  }

  it('treats a busy server and llama.cpp decode failures as transient, not bad requests', async () => {
    const { isTransientLlmFailure } = await import('./llm-client');
    assert.equal(isTransientLlmFailure(400, '{"error":"failed to decode, ret = 1"}'), true);
    assert.equal(isTransientLlmFailure(503, 'Service Unavailable'), true);
    assert.equal(isTransientLlmFailure(429, 'busy'), true);
    assert.equal(isTransientLlmFailure(400, '{"error":"model not found"}'), false);
    assert.equal(isTransientLlmFailure(401, 'unauthorized'), false);
  });

  it('chatCompletion tries a transient failure once more before giving up', async () => {
    const { chatCompletion } = await import('./llm-client');
    let calls = 0;
    await withFetch(
      () =>
        calls++ === 0
          ? new Response('{"error":"failed to decode, ret = 1"}', { status: 400 })
          : new Response(JSON.stringify({ choices: [{ message: { content: 'four scenes' } }] }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
      async () => {
        const text = await chatCompletion({
          messages: [{ role: 'user', content: 'hi' }],
          maxTokens: 10,
          model: 'test-model',
        });
        assert.equal(text, 'four scenes');
        assert.equal(calls, 2);
      }
    );
  });

  it('does not retry a request the server rejected', async () => {
    const { chatCompletion } = await import('./llm-client');
    let calls = 0;
    await withFetch(
      () => {
        calls += 1;
        return new Response('{"error":"model not found"}', { status: 400 });
      },
      async () => {
        await assert.rejects(
          chatCompletion({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 10, model: 'm' }),
          /model not found/
        );
        assert.equal(calls, 1);
      }
    );
  });
});
