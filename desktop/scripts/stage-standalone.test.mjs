import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { materializeHashedExternals } from './stage-standalone.mjs';

// Issue #8 (Windows 4.2.2): the installed server had no `.next/node_modules/sharp-<hash>`, and
// every route loading sharp failed with "Cannot find package 'sharp-20c6a5da84e2135f'".
describe('desktop staging: Turbopack hashed externals', () => {
  const dirs = [];
  after(async () => {
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  });

  async function server() {
    const root = await mkdtemp(path.join(tmpdir(), 'castcut-stage-'));
    dirs.push(root);
    const serverDir = path.join(root, 'server');
    const repoModules = path.join(root, 'repo-node_modules');
    await mkdir(path.join(serverDir, '.next', 'server', 'chunks'), { recursive: true });
    await writeFile(
      path.join(serverDir, '.next', 'server', 'chunks', 'a.js'),
      'e.x("sharp-0123456789abcdef", () => require("sharp-0123456789abcdef")); e.y("@scope/pkg-fedcba9876543210")'
    );
    // sharp traced into the server, linked as Turbopack links it.
    await mkdir(path.join(serverDir, 'node_modules', 'sharp'), { recursive: true });
    await writeFile(path.join(serverDir, 'node_modules', 'sharp', 'package.json'), '{"name":"sharp"}');
    await mkdir(path.join(serverDir, '.next', 'node_modules'), { recursive: true });
    await symlink(
      '../../node_modules/sharp',
      path.join(serverDir, '.next', 'node_modules', 'sharp-0123456789abcdef')
    );
    // @scope/pkg: no link at all (as on the Windows installer), only in the repo's node_modules.
    await mkdir(path.join(repoModules, '@scope', 'pkg'), { recursive: true });
    await writeFile(path.join(repoModules, '@scope', 'pkg', 'package.json'), '{"name":"@scope/pkg"}');
    return { serverDir, repoModules };
  }

  it('replaces a link with a real copy and makes a missing one from node_modules', async () => {
    const { serverDir, repoModules } = await server();
    const made = await materializeHashedExternals(serverDir, repoModules);
    assert.deepEqual(made.sort(), ['@scope/pkg-fedcba9876543210', 'sharp-0123456789abcdef']);
    for (const name of made) {
      const at = path.join(serverDir, '.next', 'node_modules', name);
      assert.equal((await lstat(at)).isSymbolicLink(), false);
      assert.match(await readFile(path.join(at, 'package.json'), 'utf8'), /"name"/);
    }
    // Run again: nothing left to do.
    assert.deepEqual(await materializeHashedExternals(serverDir, repoModules), []);
  });

  it('fails the staging when a package the server asks for is nowhere', async () => {
    const { serverDir } = await server();
    await assert.rejects(
      materializeHashedExternals(serverDir, path.join(serverDir, 'no-such-node_modules')),
      /@scope\/pkg-fedcba9876543210/
    );
  });
});
