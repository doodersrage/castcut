import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CutExtra } from './cut-room';
import type { KeyedShot } from './cut-plan';
import { checkMediaUrl, checkMediaUrls } from './cut-media-check';
import { missingCutMedia, relinkCutShot } from './cut-missing';
import { backToEarlierCutTake } from './cut-pins';

const shot = (key: string, url: string, entryId?: string): KeyedShot => ({
  key,
  title: key,
  url,
  kind: 'still',
  ...(entryId ? { entryId } : {}),
});

describe('missing media in Cut (M4 F3)', () => {
  it('lists gone files first, a removed render only when the file isn’t known to play', () => {
    const items = missingCutMedia({
      shots: [
        shot('day:morning', '/ok.png', 'gone-entry'),
        shot('day:afternoon', '/unknown.png', 'gone-entry'),
        shot('scenes:s1', '/gone.png'),
        shot('scenes:s2', '/ok.png'),
      ],
      states: { 'scenes:s2': { state: 'source-gone' } },
      urlStatus: new Map([
        ['/ok.png', 'ok'],
        ['/gone.png', 'missing'],
      ]),
      galleryHas: id => id !== 'gone-entry',
    });
    assert.deepEqual(
      items.map(item => [item.key, item.blocks, item.reasons.join('+')]),
      [
        ['scenes:s1', true, 'file-missing'],
        ['day:afternoon', false, 'gallery-purged'],
        ['scenes:s2', false, 'source-gone'],
      ]
    );
  });

  it('relinks a sourced shot as a pin it can go back from, even one that followed its source', () => {
    const current = shot('scenes:s1', '/gone.png', 'old');
    const relinked = relinkCutShot(
      { edits: undefined, extras: [] },
      'scenes:s1',
      { url: '/take2.png', kind: 'still', entryId: 'take2' },
      { current, now: 5 }
    );
    const edit = relinked.edits!.shots!['scenes:s1']!;
    assert.equal(edit.pin?.url, '/take2.png');
    assert.equal(edit.pin?.previous?.url, '/gone.png');
    // The source still holds the gone file: it isn't offered back as a new take.
    assert.equal(edit.pin?.declinedUrl, '/gone.png');
    assert.equal(
      backToEarlierCutTake(relinked.edits, 'scenes:s1')!.shots!['scenes:s1']!.pin?.url,
      '/gone.png'
    );
  });

  it('relinks an added Gallery shot by replacing its media; text cards are left alone', () => {
    const extras: CutExtra[] = [
      { key: 'x:1', kind: 'media', title: 'Clip', url: '/gone.mp4', shotKind: 'clip', thumbUrl: '/t.png', entryId: 'e1' },
      { key: 'x:2', kind: 'text', text: 'Later' },
    ];
    const media = relinkCutShot({ edits: undefined, extras }, 'x:1', { url: '/new.png', kind: 'still' });
    assert.deepEqual(media.extras[0], { key: 'x:1', kind: 'media', title: 'Clip', url: '/new.png', shotKind: 'still' });
    assert.equal(relinkCutShot({ edits: undefined, extras }, 'x:2', { url: '/a.png', kind: 'still' }).changed, false);
  });

  it('checks a file by one byte: 404 / 410 missing, other failures unknown, never a download', async () => {
    const seen: Array<{ url: string; range: string | undefined }> = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      seen.push({ url, range: (init?.headers as Record<string, string>)?.Range });
      if (url === '/boom') throw new Error('offline');
      return new Response(null, { status: url === '/gone' ? 404 : url === '/auth' ? 401 : 206 });
    }) as typeof fetch;
    assert.equal(await checkMediaUrl('/ok', fetcher), 'ok');
    assert.equal(await checkMediaUrl('/gone', fetcher), 'missing');
    assert.equal(await checkMediaUrl('/auth', fetcher), 'unknown');
    assert.equal(await checkMediaUrl('/boom', fetcher), 'unknown');
    assert.equal(await checkMediaUrl('data:image/png;base64,AA', fetcher), 'ok');
    assert.ok(seen.every(entry => entry.range === 'bytes=0-0'));
    const all = await checkMediaUrls(['/ok', '/gone', '/ok'], { fresh: true, fetcher });
    assert.deepEqual([...all], [['/ok', 'ok'], ['/gone', 'missing']]);
  });
});
