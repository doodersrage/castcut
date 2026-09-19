import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, mock } from 'node:test';

mock.module('server-only', { defaultExport: {}, namedExports: {} });

describe('createZipFileFromDiskPaths', async () => {
  const { createZipFileFromDiskPaths, zipCrc32Buffer } = await import('./gallery-zip-stream');
  const { zipCrc32, zipU64 } = await import('./gallery-zip-core');

  it('encodes zipU64 little-endian for ZIP64 fields', () => {
    const bytes = zipU64(0x1_0000_0005);
    assert.equal(bytes.length, 8);
    assert.equal(bytes[0], 0x05);
    assert.equal(bytes[1], 0x00);
    assert.equal(bytes[2], 0x00);
    assert.equal(bytes[3], 0x00);
    assert.equal(bytes[4], 0x01);
    assert.equal(bytes[5], 0x00);
    assert.equal(bytes[6], 0x00);
    assert.equal(bytes[7], 0x00);
  });

  it('writes a readable STORE zip from disk files without holding all bytes', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-stream-'));
    try {
      const a = path.join(dir, 'a.txt');
      const b = path.join(dir, 'nested', 'b.txt');
      fs.mkdirSync(path.dirname(b), { recursive: true });
      fs.writeFileSync(a, 'hello');
      fs.writeFileSync(b, 'world!!');
      const zipPath = path.join(dir, 'out.zip');
      const progressTicks: number[] = [];
      const result = await createZipFileFromDiskPaths(
        zipPath,
        [
          { archivePath: 'a.txt', diskPath: a },
          { archivePath: 'nested/b.txt', diskPath: b },
        ],
        {
          yieldEvery: 1,
          onProgress: ({ processed }) => {
            progressTicks.push(processed);
          },
        }
      );
      assert.equal(result.fileCount, 2);
      assert.ok(progressTicks.length >= 1);
      assert.ok(fs.existsSync(zipPath));
      const bytes = fs.readFileSync(zipPath);
      assert.ok(bytes.length > 40);
      // Local file header signature
      assert.equal(bytes[0], 0x50);
      assert.equal(bytes[1], 0x4b);
      assert.equal(bytes[2], 0x03);
      assert.equal(bytes[3], 0x04);
      assert.equal(zipCrc32Buffer(Buffer.from('hello')), zipCrc32(Buffer.from('hello')));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
