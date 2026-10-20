import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  diffusersEngineAvailability,
  installedDiffusersEngineDir,
  resolveDiffusersEngineDir,
  startDiffusersEngineInstall,
} from './diffusers-engine-install';

describe('the Diffusers engine add-on', () => {
  const saved = { ...process.env };
  let data = '';
  before(() => {
    data = fs.mkdtempSync(path.join(os.tmpdir(), 'diffusers-install-'));
    process.env.PROMPT_DATA_DIR = data;
    delete process.env.DIFFUSERS_ENGINE_DIR;
    delete process.env.DIFFUSERS_API_URL;
    delete process.env.NEXT_PUBLIC_DIFFUSERS_API_URL;
  });
  after(() => {
    process.env = saved;
    fs.rmSync(data, { recursive: true, force: true });
  });

  it('is not there until installed or pointed at', () => {
    assert.equal(resolveDiffusersEngineDir(), null);
    const state = diffusersEngineAvailability();
    assert.equal(state.available, false);
    assert.equal(state.python, undefined, 'Python is only looked up when asked');
  });

  it('is found in the data folder once installed', () => {
    const dir = installedDiffusersEngineDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'run.sh'), '#!/bin/sh\n');
    // Unpacked but install.sh not finished yet: not installed.
    assert.equal(resolveDiffusersEngineDir(), null);
    fs.writeFileSync(path.join(dir, '.castcut-version'), 'v1.0.0');
    assert.equal(resolveDiffusersEngineDir(), dir);
    const state = diffusersEngineAvailability();
    assert.equal(state.installed, true);
    assert.equal(state.version, 'v1.0.0');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('an engine URL on the server makes it available without an install', () => {
    process.env.DIFFUSERS_API_URL = 'http://gpu-box:8190';
    const state = diffusersEngineAvailability();
    assert.equal(state.installed, false);
    assert.equal(state.available, true);
    delete process.env.DIFFUSERS_API_URL;
  });

  it('DIFFUSERS_ENGINE_DIR points at one installed by hand', () => {
    process.env.DIFFUSERS_ENGINE_DIR = '/srv/castcut-diffusers';
    assert.equal(resolveDiffusersEngineDir(), '/srv/castcut-diffusers');
    delete process.env.DIFFUSERS_ENGINE_DIR;
  });

  it('refuses to install without Python, saying how to run it elsewhere', () => {
    const pathBefore = process.env.PATH;
    process.env.PATH = '';
    process.env.PYTHON = '/nonexistent/python';
    const job = startDiffusersEngineInstall();
    process.env.PATH = pathBefore;
    delete process.env.PYTHON;
    assert.equal(job.phase, 'failed');
    assert.match(job.error ?? '', /DIFFUSERS_API_URL/);
  });
});
