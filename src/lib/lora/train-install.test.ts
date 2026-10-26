import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';
import { installTrainLoraIntoComfy } from './train-install';

let workDir: string;
let previousRoot: string | undefined;
let previousDataDir: string | undefined;

before(() => {
  previousRoot = process.env.COMFYUI_ROOT;
  previousDataDir = process.env.PROMPT_DATA_DIR;
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lora-train-install-test-'));
  // Its own empty data folder: a ComfyUI saved or detected in this machine's real one (the
  // install store) would otherwise count as COMFYUI_ROOT being set (hardening H4).
  process.env.PROMPT_DATA_DIR = path.join(workDir, 'data');
});

after(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
  if (previousRoot === undefined) {
    delete process.env.COMFYUI_ROOT;
  } else {
    process.env.COMFYUI_ROOT = previousRoot;
  }
  if (previousDataDir === undefined) {
    delete process.env.PROMPT_DATA_DIR;
  } else {
    process.env.PROMPT_DATA_DIR = previousDataDir;
  }
});

afterEach(() => {
  delete process.env.COMFYUI_ROOT;
});

describe('lora-train-install', () => {
  describe('installTrainLoraIntoComfy', () => {
    it('reports not-installed when the source .safetensors does not exist on disk', () => {
      const result = installTrainLoraIntoComfy(path.join(workDir, 'missing-output.safetensors'));
      assert.equal(result.installed, false);
      assert.equal(result.filename, 'missing-output.safetensors');
      assert.match(result.skippedReason ?? '', /not found on disk/);
    });

    it('reports not-installed when COMFYUI_ROOT is not set', () => {
      const source = path.join(workDir, 'job1.safetensors');
      fs.writeFileSync(source, 'weights');
      const result = installTrainLoraIntoComfy(source);
      assert.equal(result.installed, false);
      assert.equal(result.filename, 'job1.safetensors');
      assert.equal(result.sourcePath, source);
      assert.match(result.skippedReason ?? '', /COMFYUI_ROOT is not set/);
    });

    it('reports not-installed when COMFYUI_ROOT does not exist / is not writable', () => {
      const source = path.join(workDir, 'job2.safetensors');
      fs.writeFileSync(source, 'weights');
      process.env.COMFYUI_ROOT = path.join(workDir, 'does-not-exist-root');
      const result = installTrainLoraIntoComfy(source);
      assert.equal(result.installed, false);
      assert.match(result.skippedReason ?? '', /Cannot write under/);
    });

    it('copies the source file into COMFYUI_ROOT/models/loras', () => {
      const source = path.join(workDir, 'job3.safetensors');
      fs.writeFileSync(source, 'real-weights');
      const root = path.join(workDir, 'comfy-root-1');
      fs.mkdirSync(root, { recursive: true });
      process.env.COMFYUI_ROOT = root;

      const result = installTrainLoraIntoComfy(source);
      assert.equal(result.installed, true);
      assert.equal(result.filename, 'job3.safetensors');
      assert.equal(result.sourcePath, source);
      const expectedDest = path.join(root, 'models', 'loras', 'job3.safetensors');
      assert.equal(result.destPath, expectedDest);
      assert.equal(fs.readFileSync(expectedDest, 'utf8'), 'real-weights');
      // Source file is untouched (copy, not move).
      assert.ok(fs.existsSync(source));
    });

    it('resolves a directory outputPath by picking the first *.safetensors file inside it (sorted)', () => {
      const outDir = path.join(workDir, 'job4-dir');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'b-weights.safetensors'), 'b');
      fs.writeFileSync(path.join(outDir, 'a-weights.safetensors'), 'a');
      const root = path.join(workDir, 'comfy-root-2');
      fs.mkdirSync(root, { recursive: true });
      process.env.COMFYUI_ROOT = root;

      const result = installTrainLoraIntoComfy(outDir);
      assert.equal(result.installed, true);
      assert.equal(result.filename, 'a-weights.safetensors');
    });

    it('resolves an extension-less outputPath by appending .safetensors', () => {
      const source = path.join(workDir, 'job5.safetensors');
      fs.writeFileSync(source, 'weights');
      const root = path.join(workDir, 'comfy-root-3');
      fs.mkdirSync(root, { recursive: true });
      process.env.COMFYUI_ROOT = root;

      const result = installTrainLoraIntoComfy(path.join(workDir, 'job5'));
      assert.equal(result.installed, true);
      assert.equal(result.filename, 'job5.safetensors');
    });

    it('resolves a stem-prefixed sibling file when the exact name has no extension match', () => {
      const source = path.join(workDir, 'job6-final.safetensors');
      fs.writeFileSync(source, 'weights');
      const root = path.join(workDir, 'comfy-root-4');
      fs.mkdirSync(root, { recursive: true });
      process.env.COMFYUI_ROOT = root;

      const result = installTrainLoraIntoComfy(path.join(workDir, 'job6'));
      assert.equal(result.installed, true);
      assert.equal(result.filename, 'job6-final.safetensors');
    });

    it('treats an already-installed identical source/dest path as installed without copying', () => {
      const root = path.join(workDir, 'comfy-root-5');
      const lorasDir = path.join(root, 'models', 'loras');
      fs.mkdirSync(lorasDir, { recursive: true });
      const existing = path.join(lorasDir, 'already-there.safetensors');
      fs.writeFileSync(existing, 'weights');
      process.env.COMFYUI_ROOT = root;

      const result = installTrainLoraIntoComfy(existing);
      assert.equal(result.installed, true);
      assert.equal(result.destPath, existing);
      assert.equal(result.sourcePath, existing);
    });

    it('falls back to a generic "lora.safetensors" filename when outputPath is blank and the file is missing', () => {
      const result = installTrainLoraIntoComfy('   ');
      assert.equal(result.installed, false);
      assert.equal(result.filename, 'lora.safetensors');
    });
  });
});
