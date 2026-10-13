import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  TAR_BLOCK,
  readPaxPath,
  readTarHeader,
  tarEnd,
  tarFileHeader,
  tarPadding,
} from './tar-format';

function archive(files: Array<[string, string]>): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const [name, text] of files) {
    const body = new TextEncoder().encode(text);
    parts.push(tarFileHeader(name, body.length, 1_700_000_000), body, tarPadding(body.length));
  }
  parts.push(tarEnd());
  return Buffer.concat(parts);
}

describe('tar-format', () => {
  const longName = `comfy/input/day-plates/${'plate-'.repeat(30)}é.png`;

  it('reads back what it writes, long and non-ASCII paths through pax', () => {
    const bytes = archive([
      ['gallery-media/abc/original', 'hello'],
      [longName, 'x'.repeat(600)],
    ]);
    const names: string[] = [];
    let position = 0;
    let pax: string | null = null;
    for (;;) {
      const header = readTarHeader(bytes.subarray(position, position + TAR_BLOCK));
      if (!header) break;
      const body = bytes.subarray(position + TAR_BLOCK, position + TAR_BLOCK + header.size);
      position += TAR_BLOCK + header.size + tarPadding(header.size).length;
      if (header.type === 'x') {
        pax = readPaxPath(body);
        continue;
      }
      names.push(pax ?? header.name);
      pax = null;
    }
    assert.deepEqual(names, ['gallery-media/abc/original', longName]);
  });

  it('is a tar the system tar can list', t => {
    const probe = spawnSync('tar', ['--version']);
    if (probe.status !== 0) return t.skip('no tar binary');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tar-format-'));
    try {
      const file = path.join(dir, 'a.tar');
      fs.writeFileSync(file, archive([['identity/lock', 'abc'], [longName, 'png']]));
      const listed = spawnSync('tar', ['-tf', file], { encoding: 'utf8' });
      assert.equal(listed.status, 0, listed.stderr);
      assert.deepEqual(listed.stdout.trim().split('\n'), ['identity/lock', longName]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a file that is not a tar', () => {
    const block = new Uint8Array(TAR_BLOCK).fill(65);
    assert.throws(() => readTarHeader(block), /bad tar header/);
  });
});
