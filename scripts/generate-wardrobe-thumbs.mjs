#!/usr/bin/env node
/**
 * Curate Full-outfit garment thumbs for the shared wardrobe picker.
 *
 * Ships SVG placeholders under public/wardrobe-thumbs (no Comfy required).
 * Optional --comfy later can replace files with real packshots.
 *
 * Usage:
 *   node scripts/generate-wardrobe-thumbs.mjs
 *   node scripts/generate-wardrobe-thumbs.mjs --count 200
 *   node scripts/generate-wardrobe-thumbs.mjs --dry-run
 *   node scripts/generate-wardrobe-thumbs.mjs --list
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public', 'wardrobe-thumbs');
const MANIFEST_PATH = path.join(ROOT, 'src', 'data', 'wardrobe-garment-thumbs.manifest.json');
const DEFAULT_COUNT = 200;
const WIDTH = 128;
const HEIGHT = 160;

function parseArgs(argv) {
  const args = {
    count: DEFAULT_COUNT,
    dryRun: false,
    list: false,
    clean: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--list') {
      args.list = true;
    } else if (arg === '--clean') {
      args.clean = true;
    } else if (arg === '--count') {
      const next = Number(argv[index + 1]);
      if (Number.isFinite(next) && next > 0) {
        args.count = Math.floor(next);
        index += 1;
      }
    } else if (arg?.startsWith('--count=')) {
      const next = Number(arg.slice('--count='.length));
      if (Number.isFinite(next) && next > 0) {
        args.count = Math.floor(next);
      }
    }
  }
  return args;
}

function escapeSvg(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function hueFromId(id) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return hash % 360;
}

function wrapLabel(label, maxChars) {
  const words = String(label).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [label];
  }
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length >= 3) {
        break;
      }
    } else {
      current = next;
    }
  }
  if (current && lines.length < 3) {
    lines.push(current);
  }
  return lines;
}

function buildSvg({ id, label }) {
  const hue = hueFromId(id);
  const short = label.length > 42 ? `${label.slice(0, 40).trimEnd()}…` : label;
  const lines = wrapLabel(short, 16);
  const text = lines
    .map(
      (line, index) =>
        `<text x="${WIDTH / 2}" y="${HEIGHT * 0.62 + index * 14}" text-anchor="middle" fill="#3f3f46" font-family="system-ui,sans-serif" font-size="11">${escapeSvg(line)}</text>`
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeSvg(label)}">
  <rect width="100%" height="100%" fill="#f4f4f5"/>
  <rect x="18" y="18" width="${WIDTH - 36}" height="${HEIGHT * 0.42}" rx="10" fill="hsl(${hue} 42% 72%)"/>
  <path d="M${WIDTH / 2 - 22} ${HEIGHT * 0.22} h44 v8 h-10 v28 h-24 v-28 h-10 z" fill="hsl(${hue} 38% 58%)" opacity="0.85"/>
  ${text}
</svg>
`;
}

function selectCuratedIds(entries, limit) {
  const outfits = entries
    .filter(entry => entry.category === 'outfit' && entry.id?.trim())
    .map(entry => ({
      id: entry.id.trim(),
      label: entry.label?.trim() || entry.id.trim(),
      category: entry.category,
      script: entry.script?.trim() || '',
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  if (outfits.length === 0) {
    return [];
  }
  if (outfits.length <= limit) {
    return outfits;
  }
  const stride = outfits.length / limit;
  const picked = [];
  const seen = new Set();
  for (let index = 0; index < limit; index += 1) {
    const entry = outfits[Math.min(outfits.length - 1, Math.floor(index * stride))];
    if (seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    picked.push(entry);
  }
  return picked;
}

async function loadCatalogEntries() {
  const catalogUrl = pathToFileURL(path.join(ROOT, 'src', 'lib', 'clothing-catalog.ts')).href;
  const fieldsUrl = pathToFileURL(
    path.join(ROOT, 'src', 'lib', 'clothing-catalog-fields.ts')
  ).href;
  const [catalog, fields] = await Promise.all([import(catalogUrl), import(fieldsUrl)]);
  if (typeof catalog.getClothingSelectOptions !== 'function') {
    throw new Error('Unable to load clothing catalog entries');
  }
  const categories = fields.WARDROBE_CATEGORIES ?? catalog.ALL_CLOTHING_CATEGORIES ?? ['outfit'];
  const options = catalog.getClothingSelectOptions(categories);
  return options
    .filter(option => option.value?.trim())
    .map(option => {
      const id = option.value.trim();
      const entry =
        typeof catalog.getClothingEntry === 'function' ? catalog.getClothingEntry(id) : null;
      const isOutfit =
        entry?.category === 'outfit' || /full outfits|outfit/i.test(option.group || '');
      return {
        id,
        label: entry?.label?.trim() || option.label || id,
        category: isOutfit ? 'outfit' : entry?.category || 'other',
        script: entry?.script?.trim() || '',
      };
    });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const entries = await loadCatalogEntries();
  const curated = selectCuratedIds(entries, args.count);

  if (args.list) {
    console.log(`curated ${curated.length} / catalog ${entries.length}`);
    for (const entry of curated.slice(0, 20)) {
      console.log(`  ${entry.id}`);
    }
    if (curated.length > 20) {
      console.log(`  … +${curated.length - 20} more`);
    }
    return;
  }

  console.log(
    `${args.dryRun ? '[dry-run] ' : ''}Writing ${curated.length} garment thumbs → public/wardrobe-thumbs`
  );

  if (!args.dryRun) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    if (args.clean) {
      for (const name of fs.readdirSync(PUBLIC_DIR)) {
        if (name.endsWith('.svg') || name === 'manifest.json') {
          fs.unlinkSync(path.join(PUBLIC_DIR, name));
        }
      }
    }
  }

  const thumbs = {};
  for (const entry of curated) {
    const file = `${entry.id}.svg`;
    const svg = buildSvg({ id: entry.id, label: entry.label });
    if (!args.dryRun) {
      fs.writeFileSync(path.join(PUBLIC_DIR, file), svg, 'utf8');
    }
    thumbs[entry.id] = {
      file,
      label: entry.label,
      category: entry.category,
    };
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    thumbs,
  };

  // Public copy for static hosting / debugging
  if (!args.dryRun) {
    fs.writeFileSync(path.join(PUBLIC_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  console.log(
    args.dryRun
      ? `Would write ${Object.keys(thumbs).length} thumbs + manifest`
      : `Wrote ${Object.keys(thumbs).length} thumbs + ${path.relative(ROOT, MANIFEST_PATH)}`
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
