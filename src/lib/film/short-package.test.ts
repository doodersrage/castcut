import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DayToolCache } from '../play/settings';
import type { CharacterRecord } from '../character/os';
import { buildCastFile, parseCastFile } from '../cast/transfer';
import { dayAsShort, dayShortFingerprint } from '../day/day-as-short';
import type { SavedScene } from '../day/scenes';
import type { MediaUrlStatus } from './cut-missing';
import { buildCutPackage, importCutPackage } from './cut-package-client';
import { CUT_PACKAGE_FORMAT, parseCutPackageManifest } from './cut-package';
import {
  parseShortPackage,
  placeShortPackage,
  remapPackageIds,
  shortCastIds,
  shortPackageContent,
} from './short-package';

const LEAD = 'char-rp-cast-mara-0001';
const PARTNER = 'char-rp-cast-theo-0002';
const day = {
  stillsCharacterId: LEAD,
  dayLength: 4,
  slots: [
    { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee', line: 'Coffee first.' },
    { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'reads in bed' },
  ],
} as unknown as DayToolCache;

function aShort() {
  const short = dayAsShort({ day, castId: LEAD, leadName: 'Mara', now: 1000 })!;
  const script = { ...short.script, shots: short.shots, castMap: { MARA: LEAD, THEO: PARTNER } };
  const scenes: SavedScene[] = short.scenes.map((scene, index) => ({
    ...scene,
    ...(index === 0 ? { partnerCharacterId: PARTNER } : {}),
    takes: [{ id: `take-${index}`, promptId: `p-${index}`, imageUrl: `/api/gallery/media/still-${index}?variant=original`, clipUrl: `/clip-${index}.mp4`, at: 5 }],
    keptTakeId: `take-${index}`,
  }));
  const board = {
    ...day,
    shortLink: { castId: LEAD, scriptId: script.id, fingerprint: dayShortFingerprint(day), syncedAt: 1000 },
    parkedDays: { other: { at: 1 } },
  } as unknown as DayToolCache;
  return { script, scenes, board };
}

const castFile = (id: string, name: string) =>
  buildCastFile({
    character: { id, name, looks: [] } as unknown as CharacterRecord,
    stories: [{ id: `cast-${id}` } as never],
    day: { slots: day.slots } as never,
    scenes: [{ id: 'own' } as never],
    now: 1,
  });

describe('a short as a package (format 2)', () => {
  it('takes the script’s own Scenes and its own board, and the Cast without its other things', () => {
    const { script, scenes, board } = aShort();
    const stray = { ...scenes[0]!, id: 'scene-elsewhere', fromScript: { scriptId: 'another', sceneId: 'x', shotId: 'x~1' } };
    const content = shortPackageContent({
      script,
      scenes: [...scenes, stray],
      board,
      cast: [castFile(LEAD, 'Mara')],
    });
    assert.deepEqual(content.scenes.map(scene => scene.id), scenes.map(scene => scene.id));
    assert.equal(content.board!.shortLink!.scriptId, script.id);
    assert.equal('parkedDays' in content.board!, false, 'this install’s page state stays');
    assert.deepEqual(content.cast[0]!.stories, []);
    assert.equal(content.cast[0]!.scenes, undefined);
    assert.equal(content.cast[0]!.day, undefined);
    assert.deepEqual(shortCastIds(script, scenes), [LEAD, PARTNER]);
    // Another short's board isn't this one's.
    const unlinked = { ...board, shortLink: { ...board.shortLink!, scriptId: 'another' } };
    assert.equal(shortPackageContent({ script, scenes, board: unlinked, cast: [] }).board, undefined);
  });

  it('lands with its own ids where free, and everything rewired where they were taken', () => {
    const { script, scenes, board } = aShort();
    const content = shortPackageContent({ script, scenes, board, cast: [] });
    const free = placeShortPackage(content, {
      castIds: new Map([[LEAD, LEAD]]),
      scriptIdTaken: () => false,
      sceneIdTaken: () => false,
      newScriptId: () => 'never',
      newSceneId: () => 'never',
      now: 9000,
    });
    assert.equal(free.ids.size, 0);
    assert.equal(free.script.id, script.id);
    assert.ok(free.script.updatedAt >= 9000, 'newer than a deletion of it here');

    let n = 0;
    const taken = placeShortPackage(content, {
      castIds: new Map([[LEAD, 'char-here-mara-9999'], [PARTNER, PARTNER]]),
      scriptIdTaken: () => true,
      sceneIdTaken: () => true,
      newScriptId: () => 'script-new-0000000001',
      newSceneId: () => `scene-new-${String((n += 1)).padStart(10, '0')}`,
      now: 9000,
    });
    assert.equal(taken.script.id, 'script-new-0000000001');
    assert.equal(taken.script.castId, 'char-here-mara-9999');
    assert.equal(taken.script.castMap!.MARA, 'char-here-mara-9999');
    assert.equal(taken.script.castMap!.THEO, PARTNER);
    for (const scene of taken.scenes) {
      assert.match(scene.id, /^scene-new-/);
      assert.equal(scene.fromScript!.scriptId, 'script-new-0000000001');
      assert.equal(scene.castId, 'char-here-mara-9999');
    }
    // The script's shots point at the Scenes by their new ids.
    const made = new Set(taken.script.shots!.map(shot => shot.madeSceneId).filter(Boolean));
    assert.ok([...made].every(id => taken.scenes.some(scene => scene.id === id)));
    assert.equal(taken.board!.shortLink!.scriptId, 'script-new-0000000001');
    assert.equal(taken.board!.shortLink!.castId, 'char-here-mara-9999');
    // The text is the text: her line isn't an id.
    assert.equal(taken.script.source, script.source);
  });

  it('rewrites Cut’s shot keys and pins by the new ids, and leaves short words alone', () => {
    const ids = new Map([
      ['scene-mwf1rk3e-25ab2535', 'scene-zzz-00000001'],
      ['mara', 'someone-else'],
    ]);
    const cut = {
      options: { shotEdits: { order: ['scenes:scene-mwf1rk3e-25ab2535~2'], shots: { 'scenes:scene-mwf1rk3e-25ab2535': { include: false } } } },
      castId: 'mara',
      note: 'mara pours coffee',
    };
    assert.deepEqual(remapPackageIds(cut, ids), {
      options: { shotEdits: { order: ['scenes:scene-zzz-00000001~2'], shots: { 'scenes:scene-zzz-00000001': { include: false } } } },
      castId: 'someone-else',
      note: 'mara pours coffee',
    });
  });

  it('reads back from untrusted JSON, and refuses a short with no script', () => {
    const { script, scenes, board } = aShort();
    const content = JSON.parse(JSON.stringify(shortPackageContent({ script, scenes, board, cast: [castFile(LEAD, 'Mara')] })));
    const back = parseShortPackage(content, parseCastFile)!;
    assert.equal(back.script.id, script.id);
    assert.equal(back.scenes.length, scenes.length);
    assert.equal(back.cast[0]!.character.name, 'Mara');
    assert.equal(parseShortPackage({ scenes }, parseCastFile), null);
    const manifest = { format: CUT_PACKAGE_FORMAT, version: 2, cut: {}, media: [], short: { scenes } };
    const parsed = parseCutPackageManifest(manifest);
    assert.equal(parsed.ok, false);
    assert.match(String(!parsed.ok && parsed.error), /short can’t be read/);
    // A format 1 package reads as before; a newer format is refused, never half-read.
    assert.equal(parseCutPackageManifest({ format: CUT_PACKAGE_FORMAT, version: 1, cut: {}, media: [] }).ok, true);
    assert.equal(parseCutPackageManifest({ format: CUT_PACKAGE_FORMAT, version: 3, cut: {}, media: [] }).ok, false);
  });

  it('a full package carries the short’s takes, and they are stored and relinked on another install', async () => {
    const { script, scenes, board } = aShort();
    const short = shortPackageContent({ script, scenes, board, cast: [castFile(LEAD, 'Mara')] });
    const fetcher = (async (url: string) =>
      new Response(new TextEncoder().encode(`bytes of ${url}`), {
        status: 200,
        headers: { 'content-type': url.endsWith('.mp4') ? 'video/mp4' : 'image/png' },
      })) as typeof fetch;
    const built = await buildCutPackage({ cut: { sources: ['scenes'] }, short, name: 'Her day', full: true, fetcher, now: 5 });
    // Two takes, a still and a clip each.
    assert.equal(built.packed, 4);
    const stored = new Map<string, string>();
    const imported = await importCutPackage(built.blob, {
      // A machine without any of it.
      check: async (url: string): Promise<MediaUrlStatus> => (stored.has(url) || [...stored.values()].includes(url) ? 'ok' : 'missing'),
      store: async (entryId: string) => {
        const url = `/api/gallery/media/${entryId}?variant=original`;
        stored.set(entryId, url);
        return url;
      },
    });
    assert.ok(imported.ok);
    const result = imported.ok ? imported.result : null;
    assert.equal(result!.manifest.version, 2);
    assert.equal(result!.stored, 4);
    assert.deepEqual(result!.missing, []);
    const takes = result!.short!.scenes.flatMap(scene => scene.takes);
    assert.ok(takes.every(take => /\/api\/gallery\/media\/pkg-/.test(take.imageUrl ?? '')));
    assert.ok(takes.every(take => /\/api\/gallery\/media\/pkg-/.test(take.clipUrl ?? '')));
    assert.equal(result!.short!.script.id, script.id);
  });
});
