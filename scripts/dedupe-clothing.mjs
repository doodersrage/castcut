#!/usr/bin/env node
/**
 * Remove duplicate clothing catalog entries (same category + label).
 * Keeps the first occurrence across batches in numeric order.
 *
 * Usage:
 *   node scripts/dedupe-clothing.mjs
 *   node scripts/dedupe-clothing.mjs --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const LIB_DIR = path.join(ROOT, 'src/lib/wardrobe');
const CATALOG_GLOB = /^clothing-catalog-(\d+)\.ts$/;
const ENTRY_LINE =
  /^\s*(\{ id: "[^"]+", label: "([^"]+)", category: "([^"]+)", script: "[^"]*"(?:, gender: "[^"]+")?(?:, contexts: \[[^\]]*\])? \}),?\s*$/;

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
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

function normalizeLabel(label) {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

function dedupeKey(category, label) {
  return `${category}::${normalizeLabel(label)}`;
}

function parseEntryLine(line) {
  const match = line.match(ENTRY_LINE);
  if (!match) {
    return null;
  }

  return {
    raw: match[1],
    label: match[2],
    category: match[3],
  };
}

function processFile(filePath, seen) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const kept = [];
  let removed = 0;

  for (const line of lines) {
    const entry = parseEntryLine(line);
    if (!entry) {
      kept.push(line);
      continue;
    }

    const key = dedupeKey(entry.category, entry.label);
    if (seen.has(key)) {
      removed += 1;
      continue;
    }

    seen.set(key, entry.raw);
    kept.push(`  ${entry.raw},`);
  }

  return { content: kept.join('\n'), removed, keptCount: seen.size };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Remove duplicate clothing entries (same category + label).

Options:
  --dry-run   Report duplicates without writing
  -h, --help  Show help
`);
    return;
  }

  const files = listCatalogFiles();
  const seen = new Map();
  let totalRemoved = 0;
  let totalBefore = 0;

  for (const fileName of files) {
    const filePath = path.join(LIB_DIR, fileName);
    const before = (fs.readFileSync(filePath, 'utf8').match(/^\s*\{ id:/gm) ?? []).length;
    totalBefore += before;

    const { content, removed } = processFile(filePath, seen);
    totalRemoved += removed;

    if (removed > 0) {
      console.log(`${fileName}: removed ${removed} duplicate(s)`);
      if (!args.dryRun) {
        fs.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`);
      }
    }
  }

  console.log(`\nBefore: ${totalBefore} entries`);
  console.log(`Removed: ${totalRemoved} duplicate(s)`);
  console.log(`After: ${totalBefore - totalRemoved} unique category+label entries`);

  if (args.dryRun) {
    console.log('Dry run — no files written.');
  }
}

main();
