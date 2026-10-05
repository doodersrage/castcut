import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  DEAD_COLLAPSIBLE_IDS,
  DEAD_TOOL_SETTINGS_FIELDS,
  dropDeadToolSettingsFields,
  pruneDeadCollapsibleIds,
} from './dead-settings';
import { migrateLegacyToolSettings, type ToolSettingsCache } from './settings-cache';

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

const SOURCES = sourceFiles(SRC).map(path => ({ path, text: readFileSync(path, 'utf8') }));

/** Every section id the app can still read: literal persistKeys and collapsible-persist calls. */
function liveCollapsibleIds(): { literals: Set<string>; dynamicPrefixes: string[] } {
  const literals = new Set<string>();
  const dynamicPrefixes: string[] = [];
  for (const { text } of SOURCES) {
    for (const match of text.matchAll(/persistKey=\{?\s*['"]([^'"]+)['"]/g)) {
      literals.add(match[1]!);
    }
    // persistKey={cond ? 'a' : 'b'}
    for (const match of text.matchAll(/persistKey=\{([^}]*)\}/g)) {
      for (const quoted of match[1]!.matchAll(/['"]([^'"]+)['"]/g)) literals.add(quoted[1]!);
      const template = /`([^`$]*)\$\{/.exec(match[1]!);
      if (template) dynamicPrefixes.push(template[1]!);
    }
    for (const match of text.matchAll(/(?:load|peek|save)CollapsibleOpen\(\s*['"]([^'"]+)['"]/g)) {
      literals.add(match[1]!);
    }
    // Wrapper props / constants that end up as a persistKey (e.g. RegionalEditPanel).
    for (const match of text.matchAll(/persistKey:\s*['"]([^'"]+)['"]/g)) {
      literals.add(match[1]!);
    }
  }
  // ToolEngineToggle builds its ids from these prefixes.
  dynamicPrefixes.push('tool-engine-sidebar:', 'play-engine-sidebar:');
  return { literals, dynamicPrefixes };
}

describe('dead settings — collapsible fold states', () => {
  it('no dead id is still read by the code', () => {
    const { literals, dynamicPrefixes } = liveCollapsibleIds();
    assert.ok(literals.size > 40, `found ${literals.size} live section ids`);
    for (const id of DEAD_COLLAPSIBLE_IDS) {
      assert.equal(literals.has(id), false, `${id} is still a live section id`);
      for (const prefix of dynamicPrefixes) {
        assert.equal(id.startsWith(prefix), false, `${id} matches the dynamic prefix ${prefix}`);
      }
    }
  });

  it('keeps every live and unknown id, drops only the dead ones', () => {
    const { literals } = liveCollapsibleIds();
    const stored: Record<string, boolean> = {};
    for (const id of literals) stored[id] = true;
    stored['tool-engine-sidebar:day'] = false;
    stored['play-engine-sidebar:story'] = true;
    stored['compose-templates-transfer'] = false;
    stored['some-future-section'] = true;
    stored['day-slots-lean'] = false;
    stored['day-setup-lean'] = true;
    stored['day-clothing'] = false;
    stored['mobile-day-slots-lean'] = true;

    const { map, dropped } = pruneDeadCollapsibleIds(stored);
    assert.deepEqual(dropped.sort(), [
      'day-clothing',
      'day-setup-lean',
      'day-slots-lean',
      'mobile-day-slots-lean',
    ]);
    const expected = { ...stored };
    for (const id of dropped) delete expected[id];
    assert.deepEqual(map, expected);
  });

  it('returns the same map when there is nothing to drop', () => {
    const stored = { 'gallery-import': true, 'queue-recent': false };
    const result = pruneDeadCollapsibleIds(stored);
    assert.equal(result.map, stored);
    assert.deepEqual(result.dropped, []);
  });
});

describe('dead settings — tool settings fields', () => {
  it('no dead field is declared on its tool cache any more', () => {
    const settingsSource = readFileSync(join(SRC, 'lib', 'settings-cache.ts'), 'utf8');
    for (const fields of Object.values(DEAD_TOOL_SETTINGS_FIELDS)) {
      for (const field of fields) {
        assert.doesNotMatch(settingsSource, new RegExp(`^\\s+${field}\\??:`, 'm'), field);
      }
    }
  });

  it('no dead field is read anywhere in the code', () => {
    for (const fields of Object.values(DEAD_TOOL_SETTINGS_FIELDS)) {
      for (const field of fields) {
        // dressPlates is also the name of the separate dress-plate store's sync payload.
        const pattern =
          field === 'dressPlates'
            ? /(?:day|tools\.day|dayCache|DayToolCache)\??\.dressPlates\b/
            : new RegExp(`\\b${field}\\b`);
        for (const { path, text } of SOURCES) {
          if (path.endsWith('dead-settings.ts')) continue;
          assert.doesNotMatch(text, pattern, `${field} read in ${path}`);
        }
      }
    }
  });

  const liveTools = (): ToolSettingsCache =>
    ({
      day: {
        dayMood: 'everyday',
        stills: [{ id: 's1', status: 'done' }],
        parkedDays: { cast2: { stills: [] } },
        dressPlates: [{ key: 'kit:1', imageName: 'plate.png' }],
      },
      studio: {
        compareModelB: 'flux-2-klein',
        templateId: 'duo-sport-race',
        templateSlots: { a: 'b' },
        locationBlocklist: ['beach'],
        compareVisualSeed: '123',
        catalogTab: 'locations',
      },
      roleplay: { hints: 'keep me' },
      fitting: { compareTryOns: [{ id: 't1' }] },
      generate: { hints: 'keep', generateSource: 'keywords' },
      someFutureTool: { anything: 1 },
    }) as unknown as ToolSettingsCache;

  it('drops only the dead fields and keeps every other tool and field', () => {
    const tools = liveTools();
    const { tools: next, dropped } = dropDeadToolSettingsFields(tools);
    assert.deepEqual(dropped.sort(), [
      'day.dressPlates',
      'studio.catalogTab',
      'studio.compareVisualSeed',
    ]);
    const expected = liveTools() as Record<string, Record<string, unknown>>;
    delete expected.day!.dressPlates;
    delete expected.studio!.compareVisualSeed;
    delete expected.studio!.catalogTab;
    assert.deepEqual(next, expected);
    // Untouched tools are the same objects; the input is not mutated.
    const input = tools as Record<string, unknown>;
    const output = next as Record<string, unknown>;
    assert.equal(output.roleplay, input.roleplay);
    assert.equal(output.someFutureTool, input.someFutureTool);
    assert.ok('dressPlates' in (input.day as object));
  });

  it('returns the input itself when nothing is dead', () => {
    const tools = { day: { dayMood: 'everyday' }, studio: { templateId: 'x' } } as ToolSettingsCache;
    const result = dropDeadToolSettingsFields(tools);
    assert.equal(result.tools, tools);
    assert.deepEqual(result.dropped, []);
  });

  it('the load migration reports a change only when it dropped something', () => {
    const clean = { day: { dayMood: 'everyday' } } as ToolSettingsCache;
    assert.deepEqual(migrateLegacyToolSettings(clean), { tools: clean, changed: false });

    const migrated = migrateLegacyToolSettings(liveTools());
    assert.equal(migrated.changed, true);
    assert.equal('dressPlates' in (migrated.tools.day ?? {}), false);
    assert.deepEqual(migrated.tools.day?.stills, [{ id: 's1', status: 'done' }]);
    assert.equal((migrated.tools as Record<string, unknown>).someFutureTool !== undefined, true);
  });

  it('runs alongside the legacy duo / compose / randomScene merge', () => {
    const migrated = migrateLegacyToolSettings({
      ...liveTools(),
      duo: { hints: 'duo hint' },
    } as ToolSettingsCache);
    assert.equal(migrated.changed, true);
    assert.equal(migrated.tools.character?.sceneMode, 'duo');
    assert.equal('dressPlates' in (migrated.tools.day ?? {}), false);
    assert.equal(migrated.tools.studio?.templateId, 'duo-sport-race');
  });
});
