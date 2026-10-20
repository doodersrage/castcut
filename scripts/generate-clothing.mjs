#!/usr/bin/env node
/**
 * Generate clothing catalog batch files for the character wardrobe library.
 *
 * Usage:
 *   node scripts/generate-clothing.mjs --count
 *   node scripts/generate-clothing.mjs --add 500
 *   node scripts/generate-clothing.mjs --target 3000
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  accessories,
  bottoms,
  colors,
  details,
  fits,
  footwear,
  materials,
  outerwear,
  outfits,
  tops,
  swimwearPieces,
  intimatePieces,
  hosieryPieces,
  formalwearPieces,
  dressyAccessories,
  sleepwearPieces,
  underwearPieces,
  socksPieces,
  headwearPieces,
  traditionalPieces,
} from './clothing-word-pools.mjs';
import { tagClothingEntry } from './clothing-tag-utils.mjs';

const ROOT = process.cwd();
const LIB_DIR = path.join(ROOT, 'src/lib/wardrobe');
const BATCH_INDEX = path.join(LIB_DIR, 'clothing-catalog-batches.ts');
const CATALOG_GLOB = /^clothing-catalog-(\d+)\.ts$/;

const CATEGORY_QUOTAS = {
  outfit: 0.12,
  top: 0.11,
  bottom: 0.09,
  outerwear: 0.08,
  footwear: 0.11,
  accessory: 0.085,
  swimwear: 0.04,
  intimate: 0.04,
  hosiery: 0.04,
  formalwear: 0.04,
  'dressy-accessory': 0.04,
  sleepwear: 0.04,
  underwear: 0.04,
  socks: 0.04,
  headwear: 0.04,
  traditional: 0.04,
};

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function labelKey(category, label) {
  return `${category}::${label.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

function parseArgs(argv) {
  const args = {
    count: false,
    add: null,
    target: null,
    seed: Date.now() & 0x7fffffff,
    dryRun: false,
    batch: null,
    help: false,
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
  console.log(`Generate clothing catalog entries for character wardrobe presets.

Options:
  --count              Print current catalog size
  --add <n>            Append <n> new entries (default: 500)
  --target <n>         Grow catalog until total unique entries reach <n>
  --batch <n>          Write specific batch number (auto if omitted)
  --seed <n>           RNG seed
  --dry-run            Preview without writing
  -h, --help           Show help

Examples:
  npm run clothing:count
  npm run clothing:generate
  npm run clothing:generate -- --target 3000
`);
}

function listCatalogFiles() {
  return fs
    .readdirSync(LIB_DIR)
    .filter(name => CATALOG_GLOB.test(name))
    .sort(
      (a, b) =>
        Number(a.match(CATALOG_GLOB)?.[1] ?? '0') - Number(b.match(CATALOG_GLOB)?.[1] ?? '0')
    );
}

function parseEntriesFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const entries = [];
  const re =
    /\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*category:\s*"([^"]+)",\s*script:\s*"([^"]*)"(?:,\s*gender:\s*"([^"]+)")?(?:,\s*contexts:\s*(\[[^\]]*\]))?\s*\}/g;

  for (const match of content.matchAll(re)) {
    const entry = {
      id: match[1],
      label: match[2],
      category: match[3],
      script: match[4],
    };

    if (match[5]) {
      entry.gender = match[5];
    }

    if (match[6]) {
      try {
        entry.contexts = JSON.parse(match[6]);
      } catch {
        entry.contexts = undefined;
      }
    }

    entries.push(tagClothingEntry(entry));
  }

  return entries;
}

function loadExistingCatalog() {
  const byId = new Map();
  const byLabel = new Set();
  const sources = [];

  for (const fileName of listCatalogFiles()) {
    const filePath = path.join(LIB_DIR, fileName);
    const entries = parseEntriesFromFile(filePath);
    for (const entry of entries) {
      byId.set(entry.id, entry);
      byLabel.add(labelKey(entry.category, entry.label));
    }
    sources.push({ label: fileName, count: entries.length });
  }

  return { byId, byLabel, sources };
}

function nextBatchNumber(explicitBatch) {
  if (explicitBatch) return explicitBatch;
  const batches = listCatalogFiles().map(f => Number(f.match(CATALOG_GLOB)?.[1] ?? '0'));
  return batches.length === 0 ? 1 : Math.max(...batches) + 1;
}

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function buildPhrase(category, pick) {
  const color = pick(colors);
  const detail = pick(details);
  const fit = pick(fits);

  if (category === 'outfit') {
    const outfit = pick(outfits);
    return {
      label: `${fit} ${color} ${outfit}`,
      script: `a ${fit} ${color} ${outfit}, clear silhouette and coverage`,
    };
  }

  if (category === 'top') {
    const top = pick(tops);
    const material = pickCompatibleMaterial(top, pick);
    return {
      label: `${color} ${material} ${top}`,
      script: `a ${color} ${material} ${top}, ${detail}`,
    };
  }

  if (category === 'bottom') {
    const bottom = pick(bottoms);
    return {
      label: `${color} ${bottom}`,
      script: `${color} ${bottom}, ${detail}`,
    };
  }

  if (category === 'outerwear') {
    const piece = pick(outerwear);
    const material = pickCompatibleMaterial(piece, pick);
    return {
      label: `${color} ${material} ${piece}`,
      script: `a ${color} ${material} ${piece}, ${detail}`,
    };
  }

  if (category === 'footwear') {
    const shoe = pick(footwear);
    return {
      label: `${color} ${shoe}`,
      script: `${color} ${shoe}, grounded sole contact`,
    };
  }

  if (category === 'swimwear') {
    const piece = pick(swimwearPieces);
    const material = pickFrom(['nylon', 'polyester', 'technical fabric', 'neoprene', 'mesh'], pick);
    return {
      label: `${color} ${material} ${piece}`,
      script: `a ${color} ${material} ${piece}, secure coverage and swim-ready fit`,
    };
  }

  if (category === 'intimate') {
    const piece = pick(intimatePieces);
    const material = pickFrom(['silk', 'satin', 'lace', 'mesh', 'cotton', 'modal'], pick);
    return {
      label: `${color} ${material} ${piece}`,
      script: `a ${color} ${material} ${piece}, soft drape and private-setting fit`,
    };
  }

  if (category === 'hosiery') {
    const piece = pick(hosieryPieces);
    const material = pickFrom(['nylon', 'silk', 'microfiber', 'wool', 'mesh'], pick);
    return {
      label: `${color} ${material} ${piece}`,
      script: `${color} ${material} ${piece}, sheer or opaque coverage on the legs`,
    };
  }

  if (category === 'formalwear') {
    const piece = pick(formalwearPieces);
    const material = pickCompatibleMaterial(piece, pick);
    return {
      label: `${fit} ${color} ${material} ${piece}`,
      script: `a ${fit} ${color} ${material} ${piece}, refined tailoring and formal coverage`,
    };
  }

  if (category === 'dressy-accessory') {
    const piece = pick(dressyAccessories);
    const material = pickFrom(['satin', 'silk', 'velvet', 'lace', 'leather'], pick);
    return {
      label: `${color} ${material} ${piece}`,
      script: `a ${color} ${material} ${piece}, formal scale and natural placement`,
    };
  }

  if (category === 'sleepwear') {
    const piece = pick(sleepwearPieces);
    const material = pickFrom(
      ['cotton', 'flannel', 'silk', 'satin', 'jersey', 'modal', 'linen'],
      pick
    );
    return {
      label: `${color} ${material} ${piece}`,
      script: `a ${color} ${material} ${piece}, soft coverage and at-home fit`,
    };
  }

  if (category === 'underwear') {
    const piece = pick(underwearPieces);
    const material = pickFrom(['cotton', 'jersey', 'modal', 'mesh'], pick);
    return {
      label: `${color} ${material} ${piece}`,
      script: `a ${color} ${material} ${piece}, base-layer stretch and natural fit`,
    };
  }

  if (category === 'socks') {
    const piece = pick(socksPieces);
    const material = pickFrom(['cotton', 'wool', 'merino wool', 'nylon', 'mesh'], pick);
    return {
      label: `${color} ${material} ${piece}`,
      script: `${color} ${material} ${piece}, knit texture and secure ankle fit`,
    };
  }

  if (category === 'headwear') {
    const piece = pick(headwearPieces);
    const material = pickCompatibleMaterial(piece, pick);
    return {
      label: `${color} ${material} ${piece}`,
      script: `a ${color} ${material} ${piece}, readable shape on the head`,
    };
  }

  if (category === 'traditional') {
    const piece = pick(traditionalPieces);
    const material = pickCompatibleMaterial(piece, pick);
    return {
      label: `${fit} ${color} ${material} ${piece}`,
      script: `a ${fit} ${color} ${material} ${piece}, authentic drape and traditional silhouette`,
    };
  }

  const accessory = pick(accessories);
  return {
    label: `${color} ${accessory}`,
    script: `a ${color} ${accessory}, natural scale and placement`,
  };
}

/** Ban nonsense material×garment combos models misread (silk work boots, latex hijab…). */
const MATERIAL_BAN = [
  {
    garment: /\b(?:boots?|sneakers?|cleats|oxford|loafer|heel|sandal|clog)\b/i,
    ban: /\b(?:silk|chiffon|lace|tulle|sequin)\b/i,
  },
  {
    garment: /\b(?:helmet|goggles|visor|toque|kippah)\b/i,
    ban: /\b(?:silk|chiffon|lace|latex|sequin)\b/i,
  },
  {
    garment: /\b(?:jeans|denim|coveralls|overalls|chore)\b/i,
    ban: /\b(?:silk|chiffon|lace|satin|sequin)\b/i,
  },
  {
    garment: /\b(?:raincoat|slicker|gore-tex|hardshell|softshell)\b/i,
    ban: /\b(?:silk|lace|chiffon|cashmere|velvet)\b/i,
  },
  {
    garment: /\b(?:scrubs|lab coat|surgical)\b/i,
    ban: /\b(?:leather|latex|sequin|velvet|brocade)\b/i,
  },
  { garment: /\b(?:hijab|turban|abaya|kaftan)\b/i, ban: /\b(?:latex|neoprene|gore-tex|sequin)\b/i },
];

function pickFrom(pool, pick) {
  return pool[Math.floor(pick() * pool.length) % pool.length] ?? pool[0];
}

function pickCompatibleMaterial(garment, pickFn) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const material = materials[Math.floor(pickFn() * materials.length) % materials.length];
    const banned = MATERIAL_BAN.some(rule => rule.garment.test(garment) && rule.ban.test(material));
    if (!banned) {
      return material;
    }
  }
  return 'cotton';
}

function generateEntries(byId, byLabel, countNeeded, seed) {
  const rand = createRng(seed);
  const pick = items => items[Math.floor(rand() * items.length)];
  const categories = Object.keys(CATEGORY_QUOTAS);
  const newEntries = [];
  let attempts = 0;
  const maxAttempts = Math.max(countNeeded * 50, 8000);

  while (newEntries.length < countNeeded && attempts < maxAttempts) {
    attempts += 1;
    const category = categories[attempts % categories.length];
    const phrase = buildPhrase(category, pick);
    const key = labelKey(category, phrase.label);
    if (byLabel.has(key)) {
      continue;
    }

    const baseId = slugify(`${category}-${phrase.label}`);
    let id = baseId;
    let suffix = 1;

    while (byId.has(id)) {
      suffix += 1;
      id = `${baseId}-${suffix}`;
    }

    const entry = tagClothingEntry({
      id,
      label: phrase.label,
      category,
      script: phrase.script,
    });

    byId.set(id, entry);
    byLabel.add(key);
    newEntries.push(entry);
  }

  if (newEntries.length < countNeeded) {
    throw new Error(
      `Only generated ${newEntries.length}/${countNeeded} entries. Try another --seed.`
    );
  }

  return newEntries;
}

function writeBatchFile(batchNumber, entries) {
  const exportName = `CLOTHING_CATALOG_${batchNumber}`;
  const filePath = path.join(LIB_DIR, `clothing-catalog-${batchNumber}.ts`);
  const lines = entries.map(
    entry =>
      `  { id: ${JSON.stringify(entry.id)}, label: ${JSON.stringify(entry.label)}, category: ${JSON.stringify(entry.category)}, script: ${JSON.stringify(entry.script)}, gender: ${JSON.stringify(entry.gender)}, contexts: ${JSON.stringify(entry.contexts)} },`
  );

  const content = [
    `/** Clothing catalog batch ${batchNumber}. Generated by scripts/generate-clothing.mjs */`,
    `export const ${exportName} = [`,
    ...lines,
    '] as const;',
    '',
  ].join('\n');

  fs.writeFileSync(filePath, content);
  return filePath;
}

function writeBatchIndex() {
  const files = listCatalogFiles();
  const imports = files
    .map(fileName => {
      const batchNumber = Number(fileName.match(CATALOG_GLOB)?.[1] ?? '0');
      return `import { CLOTHING_CATALOG_${batchNumber} } from "./clothing-catalog-${batchNumber}";`;
    })
    .join('\n');

  const spreads = files
    .map(fileName => {
      const batchNumber = Number(fileName.match(CATALOG_GLOB)?.[1] ?? '0');
      return `  ...(CLOTHING_CATALOG_${batchNumber} as readonly ClothingBatchEntry[]),`;
    })
    .join('\n');

  fs.writeFileSync(
    BATCH_INDEX,
    [
      '/** Auto-generated by scripts/generate-clothing.mjs — do not edit manually. */',
      imports,
      '',
      'type ClothingBatchEntry = {',
      '  readonly id: string;',
      '  readonly label: string;',
      '  readonly category: string;',
      '  readonly script: string;',
      '  readonly gender?: string;',
      '  readonly contexts?: readonly string[];',
      '};',
      '',
      'export const ALL_CLOTHING_CATALOG_ENTRIES: readonly ClothingBatchEntry[] = [',
      spreads,
      '];',
      '',
    ].join('\n')
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const { byId, byLabel, sources } = loadExistingCatalog();
  const currentTotal = byId.size;

  if (args.count) {
    console.log(`Clothing catalog entries: ${currentTotal}`);
    for (const source of sources) {
      console.log(`  ${source.label}: ${source.count}`);
    }
    const byCategory = {};
    for (const entry of byId.values()) {
      byCategory[entry.category] = (byCategory[entry.category] ?? 0) + 1;
    }
    console.log('By category:', byCategory);
    return;
  }

  let addCount = args.add;
  if (args.target != null) {
    addCount = Math.max(0, args.target - currentTotal);
    if (addCount === 0) {
      console.log(`Catalog already at ${currentTotal} entries (target ${args.target}).`);
      return;
    }
  }
  if (addCount == null || Number.isNaN(addCount) || addCount <= 0) {
    addCount = 500;
  }

  const batchNumber = nextBatchNumber(args.batch);
  const newEntries = generateEntries(new Map(byId), new Set(byLabel), addCount, args.seed);

  console.log(`Current catalog: ${currentTotal}`);
  console.log(`Generated: ${newEntries.length}`);
  console.log(`New total: ${currentTotal + newEntries.length}`);
  console.log(`Batch: ${batchNumber}`);
  console.log(`Seed: ${args.seed}`);

  if (args.dryRun) {
    console.log('Dry run — no files written.');
    for (const sample of newEntries.slice(0, 5)) {
      console.log(`  [${sample.category}] ${sample.label}`);
    }
    return;
  }

  const written = writeBatchFile(batchNumber, newEntries);
  writeBatchIndex();
  console.log(`Wrote ${written}`);
  console.log(`Updated ${BATCH_INDEX}`);
}

main();
