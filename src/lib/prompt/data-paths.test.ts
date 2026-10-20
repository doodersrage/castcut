import assert from 'node:assert/strict';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  defaultPromptStudioDataDir,
  resolvePromptAuthDir,
  resolvePromptDataDir,
} from './data-paths';

describe('prompt-data-paths', () => {
  const originalDataDir = process.env.PROMPT_DATA_DIR;
  const originalAuthDir = process.env.PROMPT_AUTH_DIR;

  beforeEach(() => {
    delete process.env.PROMPT_DATA_DIR;
    delete process.env.PROMPT_AUTH_DIR;
  });

  afterEach(() => {
    if (originalDataDir === undefined) {
      delete process.env.PROMPT_DATA_DIR;
    } else {
      process.env.PROMPT_DATA_DIR = originalDataDir;
    }
    if (originalAuthDir === undefined) {
      delete process.env.PROMPT_AUTH_DIR;
    } else {
      process.env.PROMPT_AUTH_DIR = originalAuthDir;
    }
  });

  describe('defaultPromptStudioDataDir', () => {
    it('joins process.cwd() with .prompt-studio-data', () => {
      assert.equal(defaultPromptStudioDataDir(), path.join(process.cwd(), '.prompt-studio-data'));
    });
  });

  describe('resolvePromptDataDir', () => {
    it('falls back to the default data dir when no env vars are set', () => {
      assert.equal(resolvePromptDataDir(), defaultPromptStudioDataDir());
    });

    it('uses PROMPT_DATA_DIR (resolved) when set', () => {
      process.env.PROMPT_DATA_DIR = './custom-data';
      assert.equal(resolvePromptDataDir(), path.resolve('./custom-data'));
    });

    it('ignores PROMPT_AUTH_DIR unless preferAuthDir is set', () => {
      process.env.PROMPT_AUTH_DIR = './auth-only';
      assert.equal(resolvePromptDataDir(), defaultPromptStudioDataDir());
    });

    it('prefers PROMPT_AUTH_DIR (resolved) when preferAuthDir is true and it is set', () => {
      process.env.PROMPT_AUTH_DIR = './auth-dir';
      process.env.PROMPT_DATA_DIR = './data-dir';
      assert.equal(resolvePromptDataDir({ preferAuthDir: true }), path.resolve('./auth-dir'));
    });

    it('falls through to PROMPT_DATA_DIR when preferAuthDir is true but PROMPT_AUTH_DIR is unset', () => {
      process.env.PROMPT_DATA_DIR = './data-dir';
      assert.equal(resolvePromptDataDir({ preferAuthDir: true }), path.resolve('./data-dir'));
    });
  });

  describe('resolvePromptAuthDir', () => {
    it('appends "auth" to the auth-preferring resolved data dir', () => {
      process.env.PROMPT_AUTH_DIR = './auth-dir';
      assert.equal(resolvePromptAuthDir(), path.join(path.resolve('./auth-dir'), 'auth'));
    });

    it('appends "auth" to the default data dir when no env vars are set', () => {
      assert.equal(resolvePromptAuthDir(), path.join(defaultPromptStudioDataDir(), 'auth'));
    });
  });
});
