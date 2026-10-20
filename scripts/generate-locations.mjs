#!/usr/bin/env node
/**
 * Generate additional named scene locations into batch catalog files.
 *
 * Usage:
 *   node scripts/generate-locations.mjs --count
 *   node scripts/generate-locations.mjs --add 500
 *   node scripts/generate-locations.mjs --target 3000
 *   node scripts/generate-locations.mjs --add 1000 --seed 12345 --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import { adjectives, atmospheres, places, regions } from './location-word-pools.mjs';

const ROOT = process.cwd();
const LIB_DIR = path.join(ROOT, 'src/lib/scene');
const SCENE_POOLS = path.join(ROOT, 'src/lib/specialized/scene-pools.ts');
const BATCH_INDEX = path.join(LIB_DIR, 'location-catalog-batches.ts');
const CATALOG_GLOB = /^location-catalog-extra(?:-(\d+))?\.ts$/;

function normalizeLocationKey(value) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseArgs(argv) {
  const args = {
    count: false,
    add: null,
    target: null,
    seed: Date.now() & 0x7fffffff,
    dryRun: false,
    batch: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--count') args.count = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--add') args.add = Number(argv[++i]);
    else if (arg === '--target') args.target = Number(argv[++i]);
    else if (arg === '--seed') args.seed = Number(argv[++i]);
    else if (arg === '--batch') args.batch = Number(argv[++i]);
    else if (arg === '--help' || arg === '-h') args.help = true;
  }

  return args;
}

function printHelp() {
  console.log(`Generate named scene locations for the random pool.

Options:
  --count              Print current unique pool size and exit
  --add <n>            Append <n> new locations (default when no flags: 500)
  --target <n>         Grow pool until total unique locations reach <n>
  --batch <n>          Write batch file number (auto-detects next if omitted)
  --seed <n>           RNG seed for reproducible output
  --dry-run            Compute stats without writing files
  -h, --help           Show this help

Examples:
  npm run locations:count
  npm run locations:generate
  npm run locations:generate -- --add 1000
  npm run locations:generate -- --target 5000 --seed 42
`);
}

function listCatalogFiles() {
  return fs
    .readdirSync(LIB_DIR)
    .filter(name => CATALOG_GLOB.test(name))
    .sort((a, b) => {
      const batchA = Number(a.match(CATALOG_GLOB)?.[1] ?? '1');
      const batchB = Number(b.match(CATALOG_GLOB)?.[1] ?? '1');
      return batchA - batchB;
    });
}

function exportNameForBatch(batchNumber) {
  return batchNumber === 1 ? 'EXTRA_SCENE_LOCATIONS' : `EXTRA_SCENE_LOCATIONS_${batchNumber}`;
}

function fileNameForBatch(batchNumber) {
  return batchNumber === 1
    ? 'location-catalog-extra.ts'
    : `location-catalog-extra-${batchNumber}.ts`;
}

function parseLocationsFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return [...content.matchAll(/^\s*"([^"]+)"/gm)].map(match => match[1]);
}

function loadExistingLocations() {
  const existing = new Set();
  const sources = [];

  const sceneContent = fs.readFileSync(SCENE_POOLS, 'utf8');
  const baseBlock = sceneContent.match(/const LOCATIONS = \[([\s\S]*?)\];/)?.[1] ?? '';
  const baseLocations = [...baseBlock.matchAll(/^\s*"([^"]+)"/gm)].map(match => match[1]);
  for (const location of baseLocations) {
    existing.add(normalizeLocationKey(location));
  }
  sources.push({ label: 'base LOCATIONS', count: baseLocations.length });

  for (const fileName of listCatalogFiles()) {
    const locations = parseLocationsFromFile(path.join(LIB_DIR, fileName));
    for (const location of locations) {
      existing.add(normalizeLocationKey(location));
    }
    sources.push({ label: fileName, count: locations.length });
  }

  return { existing, sources };
}

function nextBatchNumber(explicitBatch) {
  if (explicitBatch) {
    return explicitBatch;
  }

  const batches = listCatalogFiles().map(fileName =>
    Number(fileName.match(CATALOG_GLOB)?.[1] ?? '1')
  );

  return batches.length === 0 ? 1 : Math.max(...batches) + 1;
}

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function generateLocations(existing, countNeeded, seed) {
  const rand = createRng(seed);
  const pick = items => items[Math.floor(rand() * items.length)];
  const newLocations = [];

  function tryAdd(raw) {
    const key = normalizeLocationKey(raw);
    if (existing.has(key)) {
      return false;
    }
    existing.add(key);
    newLocations.push(raw);
    return true;
  }

  const patterns = [
    () => `${pick(adjectives)} ${pick(places)} ${pick(atmospheres)}`,
    () => {
      const place = pick(places);
      return `${place.charAt(0).toUpperCase()}${place.slice(1)} ${pick(regions)} ${pick(atmospheres)}`;
    },
    () => `${pick(adjectives)} ${pick(places)} ${pick(regions)}`,
    () => `${pick(adjectives)} ${pick(places)} near ${pick(places)}, ${pick(atmospheres)}`,
    () => `${pick(adjectives)} ${pick(places)} ${pick(regions)}, ${pick(atmospheres)}`,
  ];

  let attempts = 0;
  const maxAttempts = Math.max(countNeeded * 40, 5000);

  while (newLocations.length < countNeeded && attempts < maxAttempts) {
    attempts += 1;
    tryAdd(patterns[attempts % patterns.length]());
  }

  let suffix = 1;
  while (newLocations.length < countNeeded && suffix < 250000) {
    tryAdd(
      `${pick(adjectives)} ${pick(places)} ${pick(regions)}, outlook ${suffix}, ${pick(atmospheres)}`
    );
    suffix += 1;
  }

  if (newLocations.length < countNeeded) {
    throw new Error(
      `Could only generate ${newLocations.length}/${countNeeded} unique locations. Try a different --seed.`
    );
  }

  return newLocations;
}

function writeBatchFile(batchNumber, locations) {
  const exportName = exportNameForBatch(batchNumber);
  const fileName = fileNameForBatch(batchNumber);
  const filePath = path.join(LIB_DIR, fileName);

  const lines = [
    `/** Additional handcrafted scene locations (batch ${batchNumber}). */`,
    `/** Generated by scripts/generate-locations.mjs — safe to regenerate this file only. */`,
    `export const ${exportName} = [`,
    ...locations.map(location => `  ${JSON.stringify(location)},`),
    '] as const;',
    '',
  ];

  fs.writeFileSync(filePath, lines.join('\n'));
  return filePath;
}

function writeBatchIndex() {
  const catalogFiles = listCatalogFiles();
  const imports = catalogFiles
    .map(fileName => {
      const batchNumber = Number(fileName.match(CATALOG_GLOB)?.[1] ?? '1');
      const exportName = exportNameForBatch(batchNumber);
      const importPath = `./${fileName.replace(/\.ts$/, '')}`;
      return `import { ${exportName} } from "${importPath}";`;
    })
    .join('\n');

  const spreads = catalogFiles
    .map(fileName => {
      const batchNumber = Number(fileName.match(CATALOG_GLOB)?.[1] ?? '1');
      return `  ...${exportNameForBatch(batchNumber)},`;
    })
    .join('\n');

  const content = `/** Auto-generated by scripts/generate-locations.mjs — do not edit manually. */
${imports}

export const ALL_EXTRA_SCENE_LOCATIONS: readonly string[] = [
${spreads}
];
`;

  fs.writeFileSync(BATCH_INDEX, content);
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const { existing, sources } = loadExistingLocations();
  const currentTotal = existing.size;

  if (args.count) {
    console.log(`Unique named locations: ${currentTotal}`);
    for (const source of sources) {
      console.log(`  ${source.label}: ${source.count} entries`);
    }
    return;
  }

  let addCount = args.add;
  if (args.target != null) {
    addCount = Math.max(0, args.target - currentTotal);
    if (addCount === 0) {
      console.log(`Pool already at ${currentTotal} locations (target ${args.target}).`);
      return;
    }
  }

  if (addCount == null || Number.isNaN(addCount) || addCount <= 0) {
    addCount = 500;
  }

  const batchNumber = nextBatchNumber(args.batch);
  const newLocations = generateLocations(existing, addCount, args.seed);
  const newTotal = existing.size;

  console.log(`Current pool: ${currentTotal}`);
  console.log(`Generated: ${newLocations.length} new locations`);
  console.log(`New total: ${newTotal}`);
  console.log(`Batch: ${batchNumber} -> ${fileNameForBatch(batchNumber)}`);
  console.log(`Seed: ${args.seed}`);

  if (args.dryRun) {
    console.log('Dry run — no files written.');
    console.log('Sample:');
    for (const sample of newLocations.slice(0, 5)) {
      console.log(`  - ${sample}`);
    }
    return;
  }

  const writtenPath = writeBatchFile(batchNumber, newLocations);
  writeBatchIndex();
  console.log(`Wrote ${writtenPath}`);
  console.log(`Updated ${BATCH_INDEX}`);
}

main();
