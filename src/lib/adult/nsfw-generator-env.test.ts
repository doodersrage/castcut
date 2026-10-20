import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  NSFW_GENERATOR_ENV_CLIENT,
  NSFW_GENERATOR_ENV_SERVER,
  isNsfwGeneratorEnabledClient,
  isNsfwGeneratorEnabledServer,
  nsfwGeneratorEnvHint,
} from './nsfw-generator-env';

describe('nsfw-generator-env', () => {
  const originalServer = process.env[NSFW_GENERATOR_ENV_SERVER];
  const originalClient = process.env[NSFW_GENERATOR_ENV_CLIENT];

  beforeEach(() => {
    delete process.env[NSFW_GENERATOR_ENV_SERVER];
    delete process.env[NSFW_GENERATOR_ENV_CLIENT];
  });

  afterEach(() => {
    if (originalServer === undefined) {
      delete process.env[NSFW_GENERATOR_ENV_SERVER];
    } else {
      process.env[NSFW_GENERATOR_ENV_SERVER] = originalServer;
    }
    if (originalClient === undefined) {
      delete process.env[NSFW_GENERATOR_ENV_CLIENT];
    } else {
      process.env[NSFW_GENERATOR_ENV_CLIENT] = originalClient;
    }
  });

  describe('isNsfwGeneratorEnabledServer', () => {
    it('is false when the env var is unset', () => {
      assert.equal(isNsfwGeneratorEnabledServer(), false);
    });

    it('is true for "true" (case-insensitive, trimmed)', () => {
      process.env[NSFW_GENERATOR_ENV_SERVER] = '  True  ';
      assert.equal(isNsfwGeneratorEnabledServer(), true);
    });

    it('is false for any other value', () => {
      process.env[NSFW_GENERATOR_ENV_SERVER] = 'yes';
      assert.equal(isNsfwGeneratorEnabledServer(), false);
    });
  });

  describe('isNsfwGeneratorEnabledClient', () => {
    it('is false when the env var is unset', () => {
      assert.equal(isNsfwGeneratorEnabledClient(), false);
    });

    it('is true for "true" (case-insensitive, trimmed)', () => {
      process.env[NSFW_GENERATOR_ENV_CLIENT] = ' TRUE ';
      assert.equal(isNsfwGeneratorEnabledClient(), true);
    });

    it('is false for any other value', () => {
      process.env[NSFW_GENERATOR_ENV_CLIENT] = '1';
      assert.equal(isNsfwGeneratorEnabledClient(), false);
    });
  });

  describe('nsfwGeneratorEnvHint', () => {
    it('mentions both env var names', () => {
      const hint = nsfwGeneratorEnvHint();
      assert.ok(hint.includes(NSFW_GENERATOR_ENV_SERVER));
      assert.ok(hint.includes(NSFW_GENERATOR_ENV_CLIENT));
    });
  });
});
