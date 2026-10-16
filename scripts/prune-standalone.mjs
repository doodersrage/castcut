#!/usr/bin/env node
/**
 * Postbuild: strip runtime data directories out of the standalone output.
 *
 * outputFileTracingExcludes in next.config.base.cjs is supposed to keep services/ out of
 * .next/standalone (an old checkout's Diffusers engine leftovers: downloaded LoRAs, generated
 * images, venvs — the engine is its own repo now), but Turbopack's standalone file tracer has
 * known bugs where excludes are silently ignored (see vercel/next.js#84960, #88844). Rather than
 * depend on that working, this script deterministically deletes it after the trace runs.
 */
import fs from 'node:fs';
import path from 'node:path';

const STANDALONE_ROOT = path.join(process.cwd(), '.next', 'standalone');
const PRUNE_TARGETS = [
  // Anything an old checkout left under services/ (the Diffusers engine moved to its own repo).
  ['services'],
];

if (!fs.existsSync(STANDALONE_ROOT)) {
  // Not a standalone build (e.g. `next dev`, or output: 'standalone' unset) — nothing to do.
  process.exit(0);
}

let prunedBytes = 0;

function dirSizeBytes(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else {
        try {
          total += fs.statSync(full).size;
        } catch {
          // ignore races
        }
      }
    }
  }
  return total;
}

for (const parts of PRUNE_TARGETS) {
  const target = path.join(STANDALONE_ROOT, ...parts);
  if (!fs.existsSync(target)) {
    continue;
  }
  const bytes = dirSizeBytes(target);
  fs.rmSync(target, { recursive: true, force: true });
  prunedBytes += bytes;
  console.log(`[prune-standalone] removed ${parts.join('/')} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
}

if (prunedBytes > 0) {
  console.log(`[prune-standalone] total pruned: ${(prunedBytes / 1024 / 1024).toFixed(1)} MB`);
} else {
  console.log('[prune-standalone] nothing to prune (already clean).');
}
