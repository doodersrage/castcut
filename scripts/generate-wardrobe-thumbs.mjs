#!/usr/bin/env node
/**
 * Curate Full-outfit garment thumbs for the shared wardrobe picker.
 *
 * Default: SVG silhouette placeholders (type/color-aware).
 * --comfy: Real packshots via local ComfyUI (RealVisXL), saved as WebP.
 *
 * Usage:
 *   node --import tsx scripts/generate-wardrobe-thumbs.mjs
 *   node --import tsx scripts/generate-wardrobe-thumbs.mjs --comfy --missing
 *   node --import tsx scripts/generate-wardrobe-thumbs.mjs --comfy --add 100
 *   node --import tsx scripts/generate-wardrobe-thumbs.mjs --comfy --add 100 --dry-run
 *   node --import tsx scripts/generate-wardrobe-thumbs.mjs --list
 *
 * Notes:
 *   --missing only fills gaps inside the curated --count window (default 200).
 *   Once that set is complete, use --add N to generate N more outfits not yet packed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public', 'wardrobe-thumbs');
const MANIFEST_PATH = path.join(ROOT, 'src', 'data', 'wardrobe-garment-thumbs.manifest.json');
const DEFAULT_COUNT = 200;
const DEFAULT_ADD = 100;
const OUT_WIDTH = 192;
const OUT_HEIGHT = 240;
const GEN_WIDTH = 576;
const GEN_HEIGHT = 768;
const DEFAULT_CKPT = 'RealVisXL_V5.0_fp16.safetensors';
const NEGATIVE =
  'person, human, man, woman, child, face, head, hands, fingers, arms, legs, body, skin, mannequin, model, selfie, portrait, text, watermark, logo, brand, busy background, clutter, room interior, outdoors, shoes on feet with legs';

function parseArgs(argv) {
  const args = {
    count: DEFAULT_COUNT,
    dryRun: false,
    list: false,
    clean: false,
    comfy: false,
    missing: false,
    /** When set, pick this many additional outfits not already packed as Comfy WebPs. */
    add: null,
    comfyUrl: process.env.COMFYUI_API_URL?.trim() || 'http://127.0.0.1:8188',
    ckpt: process.env.WARDROBE_THUMB_CKPT?.trim() || DEFAULT_CKPT,
    steps: 16,
    cfg: 5,
    limit: null,
    ids: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--list') {
      args.list = true;
    } else if (arg === '--clean') {
      args.clean = true;
    } else if (arg === '--comfy') {
      args.comfy = true;
    } else if (arg === '--missing') {
      args.missing = true;
    } else if (arg === '--add') {
      const next = Number(argv[index + 1]);
      if (Number.isFinite(next) && next > 0) {
        args.add = Math.floor(next);
        index += 1;
      } else {
        args.add = DEFAULT_ADD;
      }
    } else if (arg?.startsWith('--add=')) {
      const next = Number(arg.slice('--add='.length));
      if (Number.isFinite(next) && next > 0) {
        args.add = Math.floor(next);
      } else {
        args.add = DEFAULT_ADD;
      }
    } else if (arg === '--id') {
      const id = String(argv[index + 1] || '').trim();
      if (id) {
        args.ids.push(id);
      }
      index += 1;
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
    } else if (arg === '--limit') {
      const next = Number(argv[index + 1]);
      if (Number.isFinite(next) && next > 0) {
        args.limit = Math.floor(next);
        index += 1;
      }
    } else if (arg === '--comfy-url') {
      args.comfyUrl = String(argv[index + 1] || '').replace(/\/$/, '');
      index += 1;
    } else if (arg === '--ckpt') {
      args.ckpt = String(argv[index + 1] || args.ckpt);
      index += 1;
    } else if (arg === '--steps') {
      const next = Number(argv[index + 1]);
      if (Number.isFinite(next) && next > 0) {
        args.steps = Math.floor(next);
        index += 1;
      }
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

function seedFromId(id) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const COLOR_WORDS = [
  ['cobalt', 215],
  ['navy', 220],
  ['indigo', 245],
  ['aqua', 185],
  ['teal', 175],
  ['emerald', 150],
  ['forest', 140],
  ['olive', 85],
  ['lime', 100],
  ['mustard', 48],
  ['gold', 45],
  ['bronze', 30],
  ['copper', 20],
  ['terracotta', 15],
  ['rust', 12],
  ['burgundy', 350],
  ['wine', 345],
  ['maroon', 355],
  ['crimson', 0],
  ['rose', 340],
  ['fuchsia', 320],
  ['magenta', 310],
  ['lavender', 270],
  ['lilac', 280],
  ['violet', 275],
  ['plum', 300],
  ['obsidian', 220],
  ['charcoal', 220],
  ['gunmetal', 210],
  ['pewter', 200],
  ['silver', 210],
  ['steel', 205],
  ['smoke', 210],
  ['ash', 210],
  ['beige', 40],
  ['khaki', 55],
  ['tan', 35],
  ['camel', 32],
  ['oatmeal', 40],
  ['ivory', 45],
  ['cream', 45],
  ['snow', 200],
  ['white', 0],
  ['black', 0],
  ['denim', 215],
  ['coral', 10],
  ['peach', 20],
  ['blush', 350],
  ['sage', 130],
  ['mint', 160],
  ['pine', 145],
  ['moss', 110],
  ['sky', 200],
  ['frost', 195],
  ['pearl', 40],
  ['espresso', 25],
  ['chocolate', 25],
  ['sepia', 30],
  ['sand', 40],
  ['stone', 35],
  ['salmon', 8],
  ['sunflower', 50],
];

function colorHueFromLabel(label, fallbackId) {
  const lower = label.toLowerCase();
  for (const [word, hue] of COLOR_WORDS) {
    if (lower.includes(word)) {
      return hue;
    }
  }
  return hueFromId(fallbackId);
}

function garmentKindFromLabel(label) {
  const lower = label.toLowerCase();
  if (/armor|cuirass|plate/.test(lower)) return 'armor';
  if (/gown|dress|tutu|dirndl|hanbok|slip dress|shirt dress|wrap dress|sweater dress/.test(lower))
    return 'dress';
  if (/robe|cassock|habit|kimono|thobe|ritual/.test(lower)) return 'robe';
  if (/tuxedo|suit|blazer|tailcoat|three-piece/.test(lower)) return 'suit';
  if (/jumpsuit|coveralls|overall|hazmat|utility/.test(lower)) return 'jumpsuit';
  if (/gi|dobok|judogi|hakama|karate|taekwondo/.test(lower)) return 'martial';
  if (/uniform|scrubs|turnout|vest look|kit/.test(lower)) return 'uniform';
  return 'outfit';
}

function silhouettePath(kind, hue) {
  const fill = `hsl(${hue} 48% 52%)`;
  const dark = `hsl(${hue} 42% 38%)`;
  const light = `hsl(${hue} 40% 68%)`;
  switch (kind) {
    case 'dress':
      return `<path d="M48 28 L80 28 L86 48 L96 140 L32 140 L42 48 Z" fill="${fill}"/><path d="M48 28 Q64 22 80 28" fill="none" stroke="${dark}" stroke-width="3"/><path d="M54 48 L74 48 L78 140 L50 140 Z" fill="${light}" opacity="0.45"/>`;
    case 'robe':
      return `<path d="M44 24 L84 24 L92 44 L98 148 L30 148 L36 44 Z" fill="${fill}"/><path d="M64 24 V148" stroke="${dark}" stroke-width="2" opacity="0.55"/><path d="M44 24 Q64 14 84 24" fill="${dark}"/><rect x="58" y="70" width="12" height="8" rx="2" fill="${light}"/>`;
    case 'suit':
      return `<path d="M46 30 L82 30 L90 52 L86 148 L42 148 L38 52 Z" fill="${fill}"/><path d="M64 30 L64 148" stroke="${dark}" stroke-width="2"/><path d="M46 30 L64 55 L82 30" fill="none" stroke="${dark}" stroke-width="2"/><rect x="52" y="70" width="24" height="4" fill="${light}"/>`;
    case 'jumpsuit':
      return `<path d="M48 26 L80 26 L88 48 L84 90 L96 148 L72 148 L64 100 L56 148 L32 148 L44 90 L40 48 Z" fill="${fill}"/><circle cx="64" cy="58" r="3" fill="${light}"/>`;
    case 'armor':
      return `<path d="M44 34 L84 34 L92 58 L88 120 L40 120 L36 58 Z" fill="${fill}"/><path d="M50 34 Q64 18 78 34" fill="${dark}"/><rect x="54" y="58" width="20" height="36" rx="3" fill="${light}" opacity="0.55"/>`;
    case 'martial':
      return `<path d="M46 28 L82 28 L88 50 L84 148 L44 148 L40 50 Z" fill="${fill}"/><path d="M40 70 H88" stroke="${dark}" stroke-width="6"/><path d="M64 28 V148" stroke="${light}" stroke-width="2" opacity="0.5"/>`;
    case 'uniform':
      return `<path d="M46 28 L82 28 L90 50 L86 100 L96 148 L70 148 L64 110 L58 148 L32 148 L42 100 L38 50 Z" fill="${fill}"/><rect x="54" y="48" width="20" height="28" rx="2" fill="${light}" opacity="0.5"/><circle cx="64" cy="56" r="2.5" fill="${dark}"/>`;
    default:
      return `<path d="M48 30 L80 30 L88 52 L84 90 L92 148 L68 148 L64 100 L60 148 L36 148 L44 90 L40 52 Z" fill="${fill}"/><path d="M48 30 Q64 22 80 30" fill="${dark}"/>`;
  }
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
      if (lines.length >= 2) {
        break;
      }
    } else {
      current = next;
    }
  }
  if (current && lines.length < 2) {
    lines.push(current);
  }
  return lines;
}

function buildSvg({ id, label }) {
  const hue = colorHueFromLabel(label, id);
  const kind = garmentKindFromLabel(label);
  const short = label.length > 36 ? `${label.slice(0, 34).trimEnd()}…` : label;
  const lines = wrapLabel(short, 18);
  const text = lines
    .map(
      (line, index) =>
        `<text x="64" y="${168 + index * 12}" text-anchor="middle" fill="#3f3f46" font-family="system-ui,sans-serif" font-size="10">${escapeSvg(line)}</text>`
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="160" viewBox="0 0 128 192" role="img" aria-label="${escapeSvg(label)}">
  <rect width="100%" height="100%" fill="#f4f4f5"/>
  <g transform="translate(0,4)">${silhouettePath(kind, hue)}</g>
  ${text}
</svg>
`;
}

function buildPackshotPrompt(entry) {
  const label = entry.label.trim() || entry.id;
  const script = entry.script?.trim();
  return [
    `Ecommerce clothing product photograph of exactly this outfit: ${label}.`,
    script ? `Fabric and construction details: ${script}.` : null,
    'Show the real garments clearly — silhouette, color, and materials must match the description.',
    'Ghost mannequin or neat flat lay on a seamless pure white studio background.',
    'No person, no face, no skin, no hands, no head, no mannequin head.',
    'Single centered outfit, catalog packshot, soft even lighting, sharp fabric detail.',
    'No text, logos, hangers, props, or busy scenery.',
  ]
    .filter(Boolean)
    .join(' ');
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

function loadExistingManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return { version: 2, thumbs: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    return { version: 2, thumbs: {} };
  }
}

function writeManifest(thumbs) {
  const manifest = {
    version: 2,
    generatedAt: new Date().toISOString(),
    thumbs,
  };
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(path.join(PUBLIC_DIR, 'manifest.json'), text);
  fs.writeFileSync(MANIFEST_PATH, text);
  return manifest;
}

function buildSdxlWorkflow({ prompt, negative, ckpt, seed, steps, cfg }) {
  return {
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: ckpt },
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: { width: GEN_WIDTH, height: GEN_HEIGHT, batch_size: 1 },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: prompt, clip: ['4', 1] },
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: { text: negative, clip: ['4', 1] },
    },
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps,
        cfg,
        sampler_name: 'dpmpp_2m',
        scheduler: 'karras',
        denoise: 1,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: { samples: ['3', 0], vae: ['4', 2] },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'wardrobe_garment', images: ['8', 0] },
    },
  };
}

async function queueComfyPrompt(comfyUrl, workflow) {
  const response = await fetch(`${comfyUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.node_errors || `Comfy /prompt failed (${response.status})`);
  }
  const promptId = data.prompt_id || data.promptId;
  if (!promptId) {
    throw new Error('Comfy /prompt returned no prompt_id');
  }
  return promptId;
}

async function waitForHistory(comfyUrl, promptId, timeoutMs = 15 * 60 * 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await fetch(`${comfyUrl}/history/${encodeURIComponent(promptId)}`);
    if (response.ok) {
      const history = await response.json();
      if (history[promptId]) {
        return history[promptId];
      }
    }
    await sleep(1500);
  }
  throw new Error(`Timed out waiting for Comfy prompt ${promptId}`);
}

function extractOutputImages(historyEntry) {
  const images = [];
  for (const output of Object.values(historyEntry.outputs || {})) {
    for (const image of output.images || []) {
      if (image?.filename) {
        images.push(image);
      }
    }
  }
  return images;
}

async function downloadComfyImage(comfyUrl, image) {
  const params = new URLSearchParams({
    filename: image.filename,
    type: image.type || 'output',
  });
  if (image.subfolder) {
    params.set('subfolder', image.subfolder);
  }
  const response = await fetch(`${comfyUrl}/view?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to download ${image.filename} (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function saveWebpThumb(buffer, destPath) {
  await sharp(buffer)
    .resize(OUT_WIDTH, OUT_HEIGHT, { fit: 'cover', position: 'centre' })
    .webp({ quality: 82 })
    .toFile(destPath);
}

function needsComfy(entry, existing) {
  const current = existing[entry.id];
  if (!current?.file) {
    return true;
  }
  if (current.source === 'comfy' && current.file.endsWith('.webp')) {
    const abs = path.join(PUBLIC_DIR, current.file);
    if (fs.existsSync(abs)) {
      return false;
    }
  }
  return true;
}

/** Next N Full-outfits that do not already have a Comfy WebP on disk. */
function selectAdditionalOutfits(entries, existing, addCount) {
  const outfits = entries
    .filter(entry => entry.category === 'outfit' && entry.id?.trim())
    .map(entry => ({
      id: entry.id.trim(),
      label: entry.label?.trim() || entry.id.trim(),
      category: entry.category,
      script: entry.script?.trim() || '',
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return outfits.filter(entry => needsComfy(entry, existing)).slice(0, Math.max(0, addCount));
}

function countPackedComfy(existing) {
  return Object.values(existing).filter(
    entry =>
      entry?.source === 'comfy' && typeof entry.file === 'string' && entry.file.endsWith('.webp')
  ).length;
}

function countOutfitEntries(entries) {
  return entries.filter(entry => entry.category === 'outfit' && entry.id?.trim()).length;
}

async function generateWithComfy(args, curated, allEntries) {
  const existing = loadExistingManifest().thumbs || {};
  const thumbs = { ...existing };
  const packed = countPackedComfy(existing);
  const outfitTotal = countOutfitEntries(allEntries);
  let targets = curated;
  let mode = 'curated';

  if (args.add != null) {
    targets = selectAdditionalOutfits(allEntries, existing, args.add);
    mode = `add ${args.add}`;
  } else if (args.missing) {
    targets = curated.filter(entry => needsComfy(entry, existing));
    mode = 'missing curated';
  }

  if (args.limit != null) {
    targets = targets.slice(0, args.limit);
  }

  console.log(
    `${args.dryRun ? '[dry-run] ' : ''}Comfy packshots (${mode}): ${targets.length} kits → ${args.comfyUrl} (${args.ckpt}, ${args.steps} steps)`
  );
  console.log(`Packed ${packed}/${outfitTotal} Full outfits`);

  if (targets.length === 0) {
    if (args.add != null) {
      console.log('Nothing left to add — every Full outfit already has a Comfy WebP.');
    } else if (args.missing) {
      console.log(
        `Curated set is complete (${curated.length}). Generate more with:\n  npm run wardrobe:thumbs:comfy -- --add 100`
      );
    } else {
      console.log('No kits selected. Pass --add 100 or --missing.');
    }
    return;
  }

  if (args.dryRun) {
    for (const entry of targets.slice(0, 5)) {
      console.log(`  would generate ${entry.id}`);
      console.log(`    ${buildPackshotPrompt(entry).slice(0, 120)}…`);
    }
    if (targets.length > 5) {
      console.log(`  … +${targets.length - 5} more`);
    }
    return;
  }

  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  let done = 0;
  for (const entry of targets) {
    const prompt = buildPackshotPrompt(entry);
    const seed = seedFromId(entry.id);
    const workflow = buildSdxlWorkflow({
      prompt,
      negative: NEGATIVE,
      ckpt: args.ckpt,
      seed,
      steps: args.steps,
      cfg: args.cfg,
    });
    process.stdout.write(`[${done + 1}/${targets.length}] ${entry.id} … `);
    try {
      const promptId = await queueComfyPrompt(args.comfyUrl, workflow);
      const history = await waitForHistory(args.comfyUrl, promptId);
      const images = extractOutputImages(history);
      if (images.length === 0) {
        throw new Error('No output images');
      }
      const buffer = await downloadComfyImage(args.comfyUrl, images[0]);
      const file = `${entry.id}.webp`;
      const dest = path.join(PUBLIC_DIR, file);
      await saveWebpThumb(buffer, dest);
      const svgPath = path.join(PUBLIC_DIR, `${entry.id}.svg`);
      if (fs.existsSync(svgPath)) {
        fs.unlinkSync(svgPath);
      }
      thumbs[entry.id] = {
        file,
        label: entry.label,
        category: entry.category,
        source: 'comfy',
        promptId,
      };
      done += 1;
      writeManifest(thumbs);
      console.log('ok');
    } catch (error) {
      console.log(`FAIL ${error instanceof Error ? error.message : String(error)}`);
      // Keep SVG fallback if present / write one
      if (!thumbs[entry.id]?.file?.endsWith('.webp')) {
        const file = `${entry.id}.svg`;
        fs.writeFileSync(path.join(PUBLIC_DIR, file), buildSvg(entry), 'utf8');
        thumbs[entry.id] = {
          file,
          label: entry.label,
          category: entry.category,
          source: 'svg',
        };
        writeManifest(thumbs);
      }
    }
  }
  console.log(`Comfy packshots complete: ${done}/${targets.length}`);
  console.log(`Packed ${countPackedComfy(thumbs)}/${outfitTotal} Full outfits`);
}

async function writeSvgPlaceholders(args, curated) {
  const existing = args.missing ? loadExistingManifest().thumbs || {} : {};
  const thumbs = { ...existing };
  console.log(
    `${args.dryRun ? '[dry-run] ' : ''}Writing ${curated.length} silhouette SVG thumbs → public/wardrobe-thumbs`
  );
  if (!args.dryRun) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    if (args.clean) {
      for (const name of fs.readdirSync(PUBLIC_DIR)) {
        if (name.endsWith('.svg') || name.endsWith('.webp') || name === 'manifest.json') {
          fs.unlinkSync(path.join(PUBLIC_DIR, name));
        }
      }
    }
  }
  for (const entry of curated) {
    if (args.missing && existing[entry.id]?.source === 'comfy' && existing[entry.id]?.file?.endsWith('.webp')) {
      continue;
    }
    const file = `${entry.id}.svg`;
    if (!args.dryRun) {
      fs.writeFileSync(path.join(PUBLIC_DIR, file), buildSvg(entry), 'utf8');
    }
    if (!(thumbs[entry.id]?.source === 'comfy' && thumbs[entry.id]?.file?.endsWith('.webp'))) {
      thumbs[entry.id] = {
        file,
        label: entry.label,
        category: entry.category,
        source: 'svg',
      };
    }
  }
  if (!args.dryRun) {
    writeManifest(thumbs);
  }
  console.log(
    args.dryRun
      ? `Would write silhouette thumbs + manifest`
      : `Wrote silhouette thumbs + ${path.relative(ROOT, MANIFEST_PATH)}`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const entries = await loadCatalogEntries();
  let curated = selectCuratedIds(entries, args.count);
  if (args.ids.length > 0) {
    const wanted = new Set(args.ids);
    const fromCatalog = entries
      .filter(entry => wanted.has(entry.id))
      .map(entry => ({
        id: entry.id,
        label: entry.label,
        category: entry.category,
        script: entry.script || '',
      }));
    const missing = args.ids.filter(id => !fromCatalog.some(entry => entry.id === id));
    if (missing.length > 0) {
      throw new Error(`Unknown wardrobe ids: ${missing.join(', ')}`);
    }
    curated = fromCatalog;
  }

  if (args.list) {
    const existing = loadExistingManifest().thumbs || {};
    const packed = countPackedComfy(existing);
    const outfitTotal = countOutfitEntries(entries);
    console.log(`curated ${curated.length} / catalog ${entries.length}`);
    console.log(`packed Comfy WebPs ${packed}/${outfitTotal} Full outfits`);
    for (const entry of curated.slice(0, 20)) {
      console.log(`  ${entry.id}`);
    }
    if (curated.length > 20) {
      console.log(`  … +${curated.length - 20} more`);
    }
    return;
  }

  if (args.comfy) {
    await generateWithComfy(args, curated, entries);
    return;
  }

  await writeSvgPlaceholders(args, curated);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
