import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  appendSharedLlmFormData,
  llmRunnerOptions,
  parseLlmRequestOptions,
  parseLlmRequestOptionsFromForm,
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  resolveRequestLlmModel,
  resolveRequestTemplateFallback,
  resolveRequestTemperature,
  resolveRequestVisionModel,
  sharedLlmRequestBody,
} from "./request-options";

describe("llm-request-options", () => {
  const originalLlmEnabled = process.env.LLM_ENABLED;
  const originalAllowFallback = process.env.ALLOW_TEMPLATE_FALLBACK;

  afterEach(() => {
    if (originalLlmEnabled === undefined) {
      delete process.env.LLM_ENABLED;
    } else {
      process.env.LLM_ENABLED = originalLlmEnabled;
    }
    if (originalAllowFallback === undefined) {
      delete process.env.ALLOW_TEMPLATE_FALLBACK;
    } else {
      process.env.ALLOW_TEMPLATE_FALLBACK = originalAllowFallback;
    }
  });

  it("parses temperature, fallback, model, vision model, and enabled from body", () => {
    const options = parseLlmRequestOptions({
      llmTemperature: 1.2,
      allowTemplateFallback: false,
      llmModel: "  qwen3:latest  ",
      llmVisionModel: " qwen3-vl:latest ",
      llmEnabled: false,
      llmProvider: "openrouter",
      llmApiKey: " sk-or-test ",
    });

    assert.equal(options.temperature, 1.2);
    assert.equal(options.allowTemplateFallback, false);
    assert.equal(options.llmModel, "qwen3:latest");
    assert.equal(options.llmVisionModel, "qwen3-vl:latest");
    assert.equal(options.llmEnabled, false);
    assert.equal(options.llmProvider, "openrouter");
    assert.equal(options.llmApiKey, "sk-or-test");
  });

  it("ignores out-of-range temperature and blank model overrides", () => {
    const options = parseLlmRequestOptions({
      llmTemperature: 9,
      llmModel: "   ",
      llmVisionModel: "",
    });

    assert.equal(options.temperature, undefined);
    assert.equal(options.llmModel, undefined);
    assert.equal(options.llmVisionModel, undefined);
  });

  it("returns defaults for a missing/null body", () => {
    assert.deepEqual(parseLlmRequestOptions(), {
      temperature: undefined,
      allowTemplateFallback: undefined,
      llmModel: undefined,
      llmVisionModel: undefined,
      llmEnabled: undefined,
    });
    assert.deepEqual(parseLlmRequestOptions(null), {
      temperature: undefined,
      allowTemplateFallback: undefined,
      llmModel: undefined,
      llmVisionModel: undefined,
      llmEnabled: undefined,
    });
  });

  it("resolveRequestTemperature falls back to server default", () => {
    process.env.LLM_TEMPERATURE = "0.5";
    assert.equal(resolveRequestTemperature(), 0.5);
    assert.equal(resolveRequestTemperature({ temperature: 1.8 }), 1.8);
    delete process.env.LLM_TEMPERATURE;
  });

  it("resolveRequestTemplateFallback honors explicit override then server default", () => {
    process.env.ALLOW_TEMPLATE_FALLBACK = "false";
    assert.equal(resolveRequestTemplateFallback(), false);
    assert.equal(resolveRequestTemplateFallback({ allowTemplateFallback: true }), true);
    assert.equal(resolveRequestTemplateFallback({ allowTemplateFallback: false }), false);
  });

  it("resolveRequestLlmEnabled short-circuits template mode on explicit false", () => {
    process.env.LLM_ENABLED = "true";
    assert.equal(resolveRequestLlmEnabled({ llmEnabled: false }), false);
    assert.equal(resolveRequestLlmEnabled({ llmEnabled: true }), true);
    assert.equal(resolveRequestLlmEnabled(), true);
    assert.equal(resolveRequestLlmEnabled(undefined), true);

    process.env.LLM_ENABLED = "false";
    assert.equal(resolveRequestLlmEnabled(), false);
    // Explicit true override cannot force-enable the local server LLM when the
    // server has it disabled — enabling still requires the server LLM_ENABLED flag.
    assert.equal(resolveRequestLlmEnabled({ llmEnabled: true }), false);
    // Session OpenRouter / Groq is an explicit opt-in and still runs.
    assert.equal(resolveRequestLlmEnabled({ llmProvider: "openrouter" }), true);
    assert.equal(
      resolveRequestLlmEnabled({ llmProvider: "groq", llmEnabled: false }),
      false,
    );
  });

  it("resolveRequestLlmEndpoint only allows known public providers", () => {
    assert.deepEqual(
      resolveRequestLlmEndpoint({ llmProvider: "openrouter", llmApiKey: "k" }),
      { baseUrl: "https://openrouter.ai/api/v1", apiKey: "k" },
    );
    assert.deepEqual(resolveRequestLlmEndpoint({ llmProvider: "groq" }), {
      baseUrl: "https://api.groq.com/openai/v1",
    });
    assert.equal(resolveRequestLlmEndpoint({ llmProvider: "server", llmApiKey: "k" }), undefined);
    assert.equal(resolveRequestLlmEndpoint(), undefined);
  });

  it("resolveRequestLlmModel / resolveRequestVisionModel trim and drop blanks", () => {
    assert.equal(resolveRequestLlmModel({ llmModel: "  llama3  " }), "llama3");
    assert.equal(resolveRequestLlmModel({ llmModel: "   " }), undefined);
    assert.equal(resolveRequestLlmModel(), undefined);
    assert.equal(
      resolveRequestVisionModel({ llmVisionModel: " qwen3-vl:latest " }),
      "qwen3-vl:latest",
    );
    assert.equal(resolveRequestVisionModel({ llmVisionModel: "" }), undefined);
  });

  it("llmRunnerOptions passes through all fields, empty object when undefined", () => {
    assert.deepEqual(llmRunnerOptions(undefined), {});
    assert.deepEqual(
      llmRunnerOptions({
        temperature: 0.9,
        allowTemplateFallback: true,
        llmModel: "model-a",
        llmVisionModel: "vision-a",
        llmEnabled: false,
      }),
      {
        temperature: 0.9,
        allowTemplateFallback: true,
        llmModel: "model-a",
        llmVisionModel: "vision-a",
        llmEnabled: false,
        llmProvider: undefined,
        llmApiKey: undefined,
      },
    );
  });

  it("appendSharedLlmFormData / parseLlmRequestOptionsFromForm round-trip hosted fields", () => {
    const form = new FormData();
    appendSharedLlmFormData(form, {
      sessionLlmTemperature: 0.8,
      sessionAllowTemplateFallback: false,
      sessionLlmModel: "openai/gpt-4o-mini",
      sessionLlmVisionModel: "openai/gpt-4o",
      sessionLlmEnabled: true,
      sessionLlmProvider: "openrouter",
      sessionLlmApiKey: " sk-or-form ",
    });
    const parsed = parseLlmRequestOptionsFromForm(form);
    assert.equal(parsed.temperature, 0.8);
    assert.equal(parsed.allowTemplateFallback, false);
    assert.equal(parsed.llmModel, "openai/gpt-4o-mini");
    assert.equal(parsed.llmVisionModel, "openai/gpt-4o");
    assert.equal(parsed.llmEnabled, true);
    assert.equal(parsed.llmProvider, "openrouter");
    assert.equal(parsed.llmApiKey, "sk-or-form");
  });

  it("sharedLlmRequestBody only includes set session overrides", () => {
    assert.deepEqual(
      sharedLlmRequestBody({
        sessionLlmTemperature: undefined,
        sessionAllowTemplateFallback: undefined,
        sessionLlmModel: undefined,
        sessionLlmVisionModel: undefined,
        sessionLlmEnabled: undefined,
        sessionLlmProvider: undefined,
        sessionLlmApiKey: undefined,
      }),
      {},
    );

    assert.deepEqual(
      sharedLlmRequestBody({
        sessionLlmTemperature: 1.1,
        sessionAllowTemplateFallback: false,
        sessionLlmModel: "  llama3  ",
        sessionLlmVisionModel: " qwen3-vl:latest ",
        sessionLlmEnabled: false,
        sessionLlmProvider: "openrouter",
        sessionLlmApiKey: " sk-or-key ",
      }),
      {
        llmTemperature: 1.1,
        allowTemplateFallback: false,
        llmModel: "llama3",
        llmVisionModel: "qwen3-vl:latest",
        llmEnabled: false,
        llmProvider: "openrouter",
        llmApiKey: "sk-or-key",
      },
    );
  });
});
