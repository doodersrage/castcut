import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { allowTemplateFallback, getLlmTemperature, isLlmEnabled } from "./env";

function restore(key: string, original: string | undefined): void {
  if (original === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = original;
  }
}

describe("llm-env", () => {
  describe("allowTemplateFallback", () => {
    const original = process.env.ALLOW_TEMPLATE_FALLBACK;

    afterEach(() => {
      restore("ALLOW_TEMPLATE_FALLBACK", original);
    });

    it("defaults to true when unset", () => {
      delete process.env.ALLOW_TEMPLATE_FALLBACK;
      assert.equal(allowTemplateFallback(), true);
    });

    it("is false only for the exact string 'false'", () => {
      process.env.ALLOW_TEMPLATE_FALLBACK = "false";
      assert.equal(allowTemplateFallback(), false);
    });

    it("is true for any other string, including 'False' or '0'", () => {
      process.env.ALLOW_TEMPLATE_FALLBACK = "False";
      assert.equal(allowTemplateFallback(), true);
      process.env.ALLOW_TEMPLATE_FALLBACK = "0";
      assert.equal(allowTemplateFallback(), true);
      process.env.ALLOW_TEMPLATE_FALLBACK = "true";
      assert.equal(allowTemplateFallback(), true);
    });
  });

  describe("isLlmEnabled", () => {
    const original = process.env.LLM_ENABLED;

    afterEach(() => {
      restore("LLM_ENABLED", original);
    });

    it("defaults to true when unset", () => {
      delete process.env.LLM_ENABLED;
      assert.equal(isLlmEnabled(), true);
    });

    it("is false only for the exact string 'false'", () => {
      process.env.LLM_ENABLED = "false";
      assert.equal(isLlmEnabled(), false);
    });

    it("is true for any other string, including 'False' or '0'", () => {
      process.env.LLM_ENABLED = "False";
      assert.equal(isLlmEnabled(), true);
      process.env.LLM_ENABLED = "0";
      assert.equal(isLlmEnabled(), true);
    });
  });

  describe("getLlmTemperature", () => {
    const original = process.env.LLM_TEMPERATURE;

    afterEach(() => {
      restore("LLM_TEMPERATURE", original);
    });

    it("accepts an in-range override, including the 0 and 2 boundaries", () => {
      delete process.env.LLM_TEMPERATURE;
      assert.equal(getLlmTemperature(0), 0);
      assert.equal(getLlmTemperature(2), 2);
      assert.equal(getLlmTemperature(1.2), 1.2);
    });

    it("falls through to the env var when the override is out of range", () => {
      process.env.LLM_TEMPERATURE = "1.5";
      assert.equal(getLlmTemperature(-0.1), 1.5);
      assert.equal(getLlmTemperature(2.1), 1.5);
    });

    it("falls through to the env var when the override is NaN or not a number", () => {
      process.env.LLM_TEMPERATURE = "0.7";
      assert.equal(getLlmTemperature(NaN), 0.7);
      assert.equal(getLlmTemperature(undefined), 0.7);
    });

    it("uses the configured env var when it is a valid in-range number", () => {
      delete process.env.LLM_TEMPERATURE;
      process.env.LLM_TEMPERATURE = "0";
      assert.equal(getLlmTemperature(), 0);
      process.env.LLM_TEMPERATURE = "2";
      assert.equal(getLlmTemperature(), 2);
    });

    it("defaults to 0.95 when the env var is missing", () => {
      delete process.env.LLM_TEMPERATURE;
      assert.equal(getLlmTemperature(), 0.95);
    });

    it("defaults to 0.95 when the env var is non-numeric", () => {
      process.env.LLM_TEMPERATURE = "not-a-number";
      assert.equal(getLlmTemperature(), 0.95);
    });

    it("defaults to 0.95 when the env var is numeric but out of range", () => {
      process.env.LLM_TEMPERATURE = "5";
      assert.equal(getLlmTemperature(), 0.95);
      process.env.LLM_TEMPERATURE = "-1";
      assert.equal(getLlmTemperature(), 0.95);
    });
  });
});
