import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withMergedToolRecords } from '../storage/tool-record-merge';
import { parseScript } from '../script/parse';
import {
  readScriptArchive,
  scriptArchiveFilename,
  scriptArchiveText,
  addScriptPatch,
  createScript,
  normalizeSavedScript,
  normalizeSavedScripts,
  SCRIPT_SCHEMA_VERSION,
  removeScriptPatch,
  renameScriptPatch,
  SCRIPT_SOURCE_MAX,
  SCRIPTS_PER_CAST,
  scriptNameOf,
  scriptsForCast,
  scriptSummary,
} from './scene-scripts';

const SOURCE = 'Title: The Rooftop\n\nINT. KITCHEN - MORNING\n\nShe pours coffee.\n\nNORA\nCoffee first.\n';

describe("a Cast's screenplays (M3 S2)", () => {
  it('keeps the text, named from its title page (else its first heading)', () => {
    const script = createScript({ castId: 'nora', source: SOURCE, now: 5, id: 's1' });
    assert.deepEqual(script, {
      id: 's1',
      castId: 'nora',
      name: 'The Rooftop',
      source: SOURCE,
      createdAt: 5,
      updatedAt: 5,
    });
    assert.equal(scriptNameOf(parseScript('EXT. PARK - DAY\n\nRain.')), 'EXT. PARK - DAY');
    assert.equal(
      scriptSummary(parseScript(SOURCE)),
      '1 scene · 1 speaking part'
    );
  });

  it('refuses an empty or too long script rather than cutting it', () => {
    assert.equal(createScript({ castId: 'nora', source: '   ' }), null);
    assert.equal(createScript({ castId: '', source: SOURCE }), null);
    assert.equal(createScript({ castId: 'nora', source: 'x'.repeat(SCRIPT_SOURCE_MAX + 1) }), null);
  });

  it('adds, renames and deletes (leaving a tombstone), per Cast and bounded', () => {
    const a = createScript({ castId: 'nora', source: SOURCE, now: 1, id: 'a' })!;
    const b = createScript({ castId: 'tomas', source: SOURCE, now: 2, id: 'b' })!;
    let cache = addScriptPatch(addScriptPatch({}, a), b);
    assert.deepEqual(scriptsForCast(cache.scripts, 'nora').map(s => s.id), ['a']);
    cache = { ...cache, ...renameScriptPatch(cache, 'a', 'Draft 2', 9)! };
    assert.equal(cache.scripts.find(s => s.id === 'a')?.name, 'Draft 2');
    assert.equal(renameScriptPatch(cache, 'a', 'Draft 2'), null, 'same name: no change');
    const removed = removeScriptPatch(cache, 'a', 10);
    assert.deepEqual(removed.scripts.map(s => s.id), ['b']);
    assert.deepEqual(removed.removedScriptAt, { a: 10 });

    const many = Array.from({ length: SCRIPTS_PER_CAST + 2 }, (_, i) =>
      createScript({ castId: 'nora', source: SOURCE, now: i + 1, id: `m${i}` })
    );
    assert.equal(normalizeSavedScripts(many).length, SCRIPTS_PER_CAST);
  });

  it("merges across devices per script: both devices' new ones stay, a deleted one stays gone", () => {
    const desk = {
      scene: {
        scripts: [createScript({ castId: 'nora', source: SOURCE, now: 1, id: 'desk' })],
        removedScriptAt: { old: 50 },
      },
    };
    const phone = {
      scene: {
        scripts: [
          createScript({ castId: 'nora', source: SOURCE, now: 2, id: 'phone' }),
          createScript({ castId: 'nora', source: SOURCE, now: 3, id: 'old' }),
        ],
      },
    };
    const merged = withMergedToolRecords(desk, phone).scene as { scripts: Array<{ id: string }> };
    assert.deepEqual(
      merged.scripts.map(s => s.id),
      ['desk', 'phone']
    );
  });
});

describe('a script archived and brought back', () => {
  it('comes back whole, newer than its deletion, as this Cast’s', () => {
    const script = {
      ...createScript({ castId: 'mara', source: 'INT. KITCHEN - MORNING\n\nShe pours.\n', name: 'Her day', now: 5, mood: 'sport' })!,
      shots: [{ id: 's1', sceneId: 'int-kitchen-morning', purpose: 'action' as const, framing: 'full' as const, who: [], seconds: 3, madeSceneId: 'scene-1' }],
    };
    const text = scriptArchiveText(script);
    assert.equal(scriptArchiveFilename(script), 'Her-day.castcut-script.json');
    const back = readScriptArchive(text, 'mara', 1000)!;
    assert.equal(back.id, script.id);
    assert.equal(back.mood, 'sport');
    assert.equal(back.shots?.[0]?.madeSceneId, 'scene-1');
    assert.equal(back.updatedAt, 1000);
    assert.equal(readScriptArchive(text, 'rob', 1000)?.castId, 'rob');
    assert.equal(readScriptArchive('INT. KITCHEN - DAY', 'mara'), null);
    assert.equal(readScriptArchive('{"kind":"other"}', 'mara'), null);
  });
});

describe('a script’s stored version', () => {
  const as317 = { id: 's1', castId: 'mara', name: 'Her day', source: 'INT. KITCHEN - DAY\n\nMara pours.', createdAt: 1, updatedAt: 2 };

  it('reads a script as 3.17 stored it (no version) unchanged, stamped', () => {
    assert.deepEqual(normalizeSavedScript(as317), { ...as317, schemaVersion: SCRIPT_SCHEMA_VERSION });
  });

  it('keeps the stamp of a script a newer release wrote, and stamps a malformed one', () => {
    assert.equal(normalizeSavedScript({ ...as317, schemaVersion: 9 })!.schemaVersion, 9);
    assert.equal(normalizeSavedScript({ ...as317, schemaVersion: 'x' })!.schemaVersion, SCRIPT_SCHEMA_VERSION);
    assert.equal(normalizeSavedScript(['not', 'a', 'script']), null);
  });
});
