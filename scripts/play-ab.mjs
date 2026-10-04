#!/usr/bin/env node
/**
 * Live A/B for Play stills on a local ComfyUI: replay real graphs with one thing
 * changed, face-score every still against the Cast plate, and write a contact sheet.
 *
 *   node scripts/play-ab.mjs spec.json [--out play-ab-out] [--comfy http://127.0.0.1:8188]
 *     [--client my-ab] [--upload-prefix my-ab-]
 *
 * The ComfyUI queue is shared: --client tags every job's client_id so others can tell your jobs
 * apart, and --upload-prefix names the scored stills uploaded to ComfyUI's input folder.
 *
 * Spec:
 * {
 *   "reference": "Castcut_00195_-cutout.png",   // ComfyUI input image the face is scored against
 *   "seeds": [1111, 2222],
 *   "cases": [{
 *     "name": "walk",
 *     "seeds": [123],
 *     "reference": "other-plate.png",                          // optional: this case's own face reference                                          // optional: this case's own seeds (e.g. the still's)
 *     "graph": "/var/lib/comfyui/output/Castcut_00311_.png",  // output PNG (embedded prompt) or API-format .json
 *     "variants": {
 *       "square":   { "latent": [1328, 1328] },
 *       "portrait": { "latent": [1104, 1472], "steps": 8,
 *                     "replace": [["old prompt text", "new prompt text"]],
 *                     "inputs": { "900": { "image": "other-plate.png" }, "4": { "image3": null } },
 *                     "nodes": { "990": { "class_type": "ImageCrop", "inputs": { ... } } } }
 *     }
 *   }]
 * }
 *
 * Face distance is InsightFace cosine (FaceEmbedDistance, lower = closer; 100 = no face).
 * Always look at the contact sheet too — a face score alone once picked the variant that
 * wore the wrong clothes. Needs the ComfyUI_FaceAnalysis nodes (same as /api/face-match).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const specPath = args.find(arg => !arg.startsWith('--'));
const flag = name => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
if (!specPath) {
  console.error('usage: node scripts/play-ab.mjs spec.json [--out dir] [--comfy url]');
  process.exit(1);
}
const COMFY = (flag('comfy') ?? process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188').replace(
  /\/$/,
  ''
);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const clientId = flag('client');
const uploadPrefix = flag('upload-prefix') ?? 'play-ab-';
const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = resolve(flag('out') ?? join('play-ab-out', runId));
mkdirSync(outDir, { recursive: true });

const sleep = ms => new Promise(done => setTimeout(done, ms));

async function comfy(path, body) {
  const response = await fetch(`${COMFY}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body:
      body === undefined
        ? undefined
        : JSON.stringify(path === '/prompt' && clientId ? { ...body, client_id: clientId } : body),
  });
  if (!response.ok) {
    throw new Error(`${path}: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function loadGraph(source) {
  if (source.endsWith('.json')) {
    return JSON.parse(readFileSync(source, 'utf8'));
  }
  const meta = await sharp(source).metadata();
  const prompt = meta.comments?.find(comment => comment.keyword === 'prompt')?.text;
  if (!prompt) {
    throw new Error(`${source} has no embedded ComfyUI prompt`);
  }
  return JSON.parse(prompt);
}

const LATENT_TYPES = new Set([
  'EmptySD3LatentImage',
  'EmptyLatentImage',
  'EmptyQwenImageLayeredLatentImage',
]);

/** Apply one variant's overrides to a copy of the graph. */
function applyVariant(graph, variant, seed, prefix) {
  const next = structuredClone(graph);
  const nodes = Object.values(next);
  if (variant.latent) {
    const [width, height] = variant.latent;
    const latent = nodes.find(node => LATENT_TYPES.has(node.class_type));
    const old = latent ? [latent.inputs.width, latent.inputs.height] : null;
    for (const node of nodes) {
      if (LATENT_TYPES.has(node.class_type)) {
        Object.assign(node.inputs, { width, height });
      }
      // Reference scale nodes that were sized to the old latent follow it.
      if (
        old &&
        node.class_type === 'ResizeAndPadImage' &&
        node.inputs.target_width === old[0] &&
        node.inputs.target_height === old[1]
      ) {
        Object.assign(node.inputs, { target_width: width, target_height: height });
      }
      if (
        old &&
        node.class_type === 'ImageScale' &&
        node.inputs.width === old[0] &&
        node.inputs.height === old[1]
      ) {
        Object.assign(node.inputs, { width, height });
      }
    }
  }
  for (const [find, replaceWith] of variant.replace ?? []) {
    let hits = 0;
    for (const node of nodes) {
      for (const key of ['prompt', 'text']) {
        if (typeof node.inputs?.[key] === 'string' && node.inputs[key].includes(find)) {
          node.inputs[key] = node.inputs[key].split(find).join(replaceWith);
          hits += 1;
        }
      }
    }
    if (hits === 0) {
      throw new Error(`replace: "${find.slice(0, 60)}" not found in any prompt`);
    }
  }
  // Whole nodes to add or replace (e.g. a crop in front of a VAEEncode), then input rewires.
  for (const [nodeId, node] of Object.entries(variant.nodes ?? {})) {
    next[nodeId] = structuredClone(node);
  }
  for (const [nodeId, inputs] of Object.entries(variant.inputs ?? {})) {
    if (!next[nodeId]) {
      throw new Error(`inputs: node ${nodeId} is not in the graph`);
    }
    Object.assign(next[nodeId].inputs, inputs);
    // null removes an input (e.g. drop a reference image from the encoder).
    for (const [key, value] of Object.entries(inputs)) {
      if (value === null) delete next[nodeId].inputs[key];
    }
  }
  for (const node of nodes) {
    // Every seed in the graph, not only KSampler's: Qwen-Image 2.1 graphs draw their noise from
    // a RandomNoise node (noise_seed) and replayed the same take for every seed. A linked input
    // (an [id, slot] pair) is left alone.
    for (const key of ['seed', 'noise_seed']) {
      if (typeof node.inputs?.[key] === 'number') node.inputs[key] = seed;
    }
    if (node.class_type === 'KSampler' || node.class_type === 'KSamplerAdvanced') {
      if (variant.steps) node.inputs.steps = variant.steps;
    }
    if (node.class_type === 'SaveImage') {
      node.inputs.filename_prefix = prefix;
    }
  }
  return next;
}

async function waitFor(promptId) {
  for (;;) {
    const history = await comfy(`/history/${promptId}`);
    const entry = history[promptId];
    if (entry?.status?.completed !== undefined || entry?.status?.status_str === 'error') {
      if (entry.status.status_str !== 'success') {
        throw new Error(
          `prompt ${promptId} failed: ${JSON.stringify(entry.status.messages?.slice(-1))}`
        );
      }
      return entry;
    }
    await sleep(2000);
  }
}

async function uploadInput(buffer, name) {
  const form = new FormData();
  form.append('image', new Blob([buffer], { type: 'image/png' }), name);
  form.append('overwrite', 'true');
  const response = await fetch(`${COMFY}/upload/image`, { method: 'POST', body: form });
  if (!response.ok) {
    throw new Error(`upload ${name}: ${response.status}`);
  }
}

async function faceDistance(reference, inputName) {
  const graph = {
    1: { class_type: 'FaceAnalysisModels', inputs: { library: 'insightface', provider: 'CUDA' } },
    2: { class_type: 'LoadImage', inputs: { image: reference } },
    3: { class_type: 'LoadImage', inputs: { image: inputName } },
    4: {
      class_type: 'FaceEmbedDistance',
      inputs: {
        analysis_models: ['1', 0],
        reference: ['2', 0],
        image: ['3', 0],
        similarity_metric: 'cosine',
        filter_thresh: 100,
        filter_best: 0,
        generate_image_overlay: false,
      },
    },
    5: { class_type: 'PreviewAny', inputs: { source: ['4', 1] } },
  };
  const { prompt_id: promptId } = await comfy('/prompt', { prompt: graph });
  const entry = await waitFor(promptId);
  const raw = entry.outputs?.['5']?.text?.[0];
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const value = Array.isArray(parsed) ? parsed[0] : parsed;
  return typeof value === 'number' ? value : null;
}

function escapeXml(text) {
  return text.replace(
    /[<>&"]/g,
    char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[char]
  );
}

async function contactSheet(rows, file) {
  const tile = 300;
  const columns = Math.max(...rows.map(row => row.length));
  const composites = [];
  for (const [rowIndex, row] of rows.entries()) {
    for (const [columnIndex, cell] of row.entries()) {
      const image = await sharp(cell.buffer)
        .resize(tile, tile, { fit: 'contain', background: '#ffffff' })
        .png()
        .toBuffer();
      const label = Buffer.from(
        `<svg width="${tile}" height="18"><rect width="${tile}" height="18" fill="black"/>` +
          `<text x="4" y="13" font-family="sans-serif" font-size="12" fill="yellow">${escapeXml(cell.label)}</text></svg>`
      );
      const left = columnIndex * tile;
      const top = rowIndex * tile;
      composites.push({ input: image, left, top }, { input: label, left, top });
    }
  }
  await sharp({
    create: {
      width: columns * tile,
      height: rows.length * tile,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite(composites)
    .jpeg({ quality: 80 })
    .toFile(file);
}

const seeds = spec.seeds?.length ? spec.seeds : [1111, 2222];
const jobs = [];
for (const testCase of spec.cases) {
  const graph = await loadGraph(testCase.graph);
  for (const [variantName, variant] of Object.entries(testCase.variants)) {
    for (const seed of testCase.seeds?.length ? testCase.seeds : seeds) {
      const prefix = `play-ab/${runId}/${testCase.name}_${variantName}_${seed}`;
      const { prompt_id: promptId } = await comfy('/prompt', {
        prompt: applyVariant(graph, variant, seed, prefix),
      });
      jobs.push({
        case: testCase.name,
        variant: variantName,
        seed,
        promptId,
        reference: testCase.reference ?? spec.reference,
      });
    }
  }
}
console.log(`queued ${jobs.length} renders → ${outDir}`);

for (const [index, job] of jobs.entries()) {
  const entry = await waitFor(job.promptId);
  const image = Object.values(entry.outputs)
    .flatMap(output => output.images ?? [])
    .find(Boolean);
  const view = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder,
    type: image.type,
  });
  const buffer = Buffer.from(await (await fetch(`${COMFY}/view?${view}`)).arrayBuffer());
  const local = join(outDir, `${job.case}_${job.variant}_${job.seed}.png`);
  writeFileSync(local, buffer);
  job.file = local;
  job.buffer = buffer;
  if (job.reference) {
    const inputName = `${uploadPrefix}${runId}-${basename(local)}`;
    await uploadInput(buffer, inputName);
    job.faceDistance = await faceDistance(job.reference, inputName);
  }
  console.log(
    `[${index + 1}/${jobs.length}] ${job.case} ${job.variant} s${job.seed}` +
      (job.faceDistance != null ? ` face ${job.faceDistance.toFixed(3)}` : '')
  );
}

// Summary: mean face distance per variant, and per-pair wins against the first variant.
const variantNames = [...new Set(jobs.map(job => job.variant))];
const baseline = variantNames[0];
console.log('\nvariant           mean face   n   closer than ' + baseline);
for (const name of variantNames) {
  const scored = jobs.filter(
    job => job.variant === name && job.faceDistance != null && job.faceDistance < 99
  );
  const mean = scored.reduce((sum, job) => sum + job.faceDistance, 0) / (scored.length || 1);
  let wins = 0;
  let pairs = 0;
  for (const job of scored) {
    const base = jobs.find(
      other => other.variant === baseline && other.case === job.case && other.seed === job.seed
    );
    if (name !== baseline && base?.faceDistance != null) {
      pairs += 1;
      if (job.faceDistance < base.faceDistance) wins += 1;
    }
  }
  console.log(
    `${name.padEnd(18)}${scored.length ? mean.toFixed(3) : '  n/a'}      ${String(scored.length).padEnd(4)}` +
      (name === baseline ? '—' : `${wins}/${pairs}`)
  );
}

const rows = [];
for (const testCase of spec.cases) {
  for (const seed of testCase.seeds?.length ? testCase.seeds : seeds) {
    rows.push(
      jobs
        .filter(job => job.case === testCase.name && job.seed === seed)
        .map(job => ({
          buffer: job.buffer,
          label: `${job.case} ${job.variant} s${job.seed}${job.faceDistance != null ? ` ${job.faceDistance.toFixed(2)}` : ''}`,
        }))
    );
  }
}
await contactSheet(rows, join(outDir, 'contact.jpg'));
writeFileSync(
  join(outDir, 'results.json'),
  JSON.stringify(
    jobs.map(({ buffer: _buffer, ...job }) => job),
    null,
    2
  )
);
console.log(`\ncontact sheet: ${join(outDir, 'contact.jpg')}`);
