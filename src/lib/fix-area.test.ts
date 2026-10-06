import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFixAreaGraph,
  faceFixBox,
  findFixAreaIdentityImages,
  FIX_AREA_DEFAULT_TEXT,
  FIX_AREA_FACE_DENOISE,
  FIX_AREA_FACE_REFERENCE,
  FIX_AREA_FACE_TEXT,
  resolveFixAreaRun,
  FIX_AREA_OUTPUT_PREFIX,
  FIX_AREA_ZOOM_MIN,
  fixAreaPromptLine,
  fixAreaSeeds,
  fixAreaZoomWindow,
  maskBoundsFraction,
  normalizeFixAreaDenoise,
  normalizeFixAreaText,
  readFixAreaStillPrompt,
  trimSigmasForDenoise,
} from './fix-area';

/** A Rapid AIO Day still graph, as ComfyUI embeds it (trimmed). */
const rapid = {
  '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'Qwen-Rapid-AIO-SFW-v23.safetensors' } },
  '4': {
    class_type: 'TextEncodeQwenImageEditPlus',
    inputs: { prompt: 'Edit Image 1: a woman at a café table.', clip: ['1', 1], image1: ['900', 0], image2: ['903', 0], image3: ['904', 0] },
  },
  '5': {
    class_type: 'TextEncodeQwenImageEditPlus',
    inputs: { prompt: 'moire, halftone', clip: ['1', 1], image1: ['900', 0], image2: ['903', 0], image3: ['904', 0] },
  },
  '7': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['1', 0], shift: 3.1 } },
  '8': {
    class_type: 'KSampler',
    inputs: { seed: 1, steps: 8, cfg: 1, sampler_name: 'euler_ancestral', scheduler: 'simple', denoise: 1, model: ['7', 0], positive: ['917', 0], negative: ['5', 0], latent_image: ['905', 0] },
  },
  '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['1', 2] } },
  '10': { class_type: 'SaveImage', inputs: { images: ['902', 0], filename_prefix: 'Castcut' } },
  '900': { class_type: 'LoadImage', inputs: { image: 'day-face.png' } },
  '902': { class_type: 'ImageBlur', inputs: { image: ['9', 0], blur_radius: 1, sigma: 0.45 } },
  '903': { class_type: 'LoadImage', inputs: { image: 'day-dress-plate.png' } },
  '904': { class_type: 'LoadImage', inputs: { image: 'day-pose-guide.png' } },
  '905': { class_type: 'EmptySD3LatentImage', inputs: { width: 960, height: 1280, batch_size: 1 } },
  '914': { class_type: 'VAEEncode', inputs: { pixels: ['900', 0], vae: ['1', 2] } },
  '915': { class_type: 'ReferenceLatent', inputs: { conditioning: ['4', 0], latent: ['914', 0] } },
  '916': { class_type: 'VAEEncode', inputs: { pixels: ['903', 0], vae: ['1', 2] } },
  '917': { class_type: 'ReferenceLatent', inputs: { conditioning: ['915', 0], latent: ['916', 0] } },
  '950': { class_type: 'PreviewImage', inputs: { images: ['9', 0] } },
};

/** A Qwen-Image 2.1 still (SamplerCustomAdvanced + manual sigmas). */
const qwen21 = {
  '8': { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['925', 0], guider: ['926', 0], sampler: ['927', 0], sigmas: ['928', 0], latent_image: ['924', 0] } },
  '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['920', 0] } },
  '10': { class_type: 'SaveImage', inputs: { images: ['9', 0], filename_prefix: 'Castcut' } },
  '900': { class_type: 'LoadImage', inputs: { image: 'face.png' } },
  '903': { class_type: 'LoadImage', inputs: { image: 'plate.png' } },
  '918': { class_type: 'UNETLoader', inputs: { unet_name: 'qwen_image_2.1_bf16.safetensors', weight_dtype: 'default' } },
  '919': { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl.safetensors', type: 'qwen_image' } },
  '920': { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_2.1_vae.safetensors' } },
  '923': {
    class_type: 'TextEncodeQwenImage21',
    inputs: { clip: ['919', 0], vae: ['920', 0], prompt: 'Edit <image1>: a walk.', negative_prompt: '', resolution: 1280, 'images.image_1': ['900', 0], 'images.image_2': ['903', 0] },
  },
  '924': { class_type: 'EmptyLatentImage', inputs: { width: 1104, height: 1472, batch_size: 1 } },
  '925': { class_type: 'RandomNoise', inputs: { noise_seed: 5 } },
  '926': { class_type: 'BasicGuider', inputs: { model: ['918', 0], conditioning: ['923', 0] } },
  '927': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
  '928': { class_type: 'ManualSigmas', inputs: { sigmas: '1.0, 0.9, 0.8, 0.5, 0.2, 0.0' } },
};

/** A plain text-to-image still (no image inputs). */
const sdxl = {
  '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sdxl.safetensors' } },
  '2': { class_type: 'CLIPTextEncode', inputs: { text: 'a red bicycle', clip: ['1', 1] } },
  '3': { class_type: 'CLIPTextEncode', inputs: { text: 'blurry', clip: ['1', 1] } },
  '4': { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
  '5': { class_type: 'KSampler', inputs: { seed: 3, steps: 30, cfg: 6, sampler_name: 'euler', scheduler: 'normal', denoise: 1, model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0] } },
  '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
  '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'Castcut' } },
};

const names = {
  stillName: 'fix-area-still.png',
  fillName: 'fix-area-fill.png',
  hardMaskName: 'fix-area-mask-hard.png',
  softMaskName: 'fix-area-mask-soft.png',
};

describe('fix-area graph', () => {
  it('patches a Rapid still: grey-filled Image 1, one reference latent, noise mask, composite', () => {
    const built = buildFixAreaGraph(rapid, { ...names, seed: 42, denoise: 1, reference: 'grey', text: 'a plain wooden chair' });
    assert.ok(built);
    const g = built.graph;
    assert.equal(built.edit, true);
    // Sampler: masked latent from the grey fill, the new seed.
    assert.deepEqual(g['8']!.inputs.latent_image, ['fa_latent', 0]);
    assert.equal(g['8']!.inputs.seed, 42);
    assert.equal(g['8']!.inputs.denoise, 1);
    assert.deepEqual(g.fa_latent!.inputs, { samples: ['fa_encode', 0], mask: ['fa_hard', 0] });
    assert.deepEqual(g.fa_encode!.inputs.pixels, ['fa_fill', 0]);
    assert.deepEqual(g.fa_encode!.inputs.vae, ['1', 2]);
    // Image 1 is the fill; the plate and the pose guide are gone, positive and negative.
    for (const id of ['4', '5']) {
      assert.deepEqual(g[id]!.inputs.image1, ['fa_fill', 0]);
      assert.equal('image2' in g[id]!.inputs, false);
      assert.equal('image3' in g[id]!.inputs, false);
    }
    // The fix line on the positive prompt only.
    assert.match(String(g['4']!.inputs.prompt), /^Edit Image 1: a woman at a café table\.\nFix only the marked area: a plain wooden chair\. The flat grey patch/);
    assert.equal(g['5']!.inputs.prompt, 'moire, halftone');
    // The two chained reference latents collapse into one on the fill.
    assert.deepEqual(g['917']!.inputs, { conditioning: ['4', 0], latent: ['fa_encode', 0] });
    assert.equal(g['915'], undefined);
    // Composite onto the still through the soft mask, after the still's own blur; saved alone.
    assert.deepEqual(g.fa_composite!.inputs, {
      destination: ['fa_still', 0],
      source: ['902', 0],
      x: 0,
      y: 0,
      resize_source: false,
      mask: ['fa_soft', 0],
    });
    assert.deepEqual(g['10']!.inputs.images, ['fa_composite', 0]);
    assert.equal(g['10']!.inputs.filename_prefix, FIX_AREA_OUTPUT_PREFIX);
    for (const gone of ['900', '903', '904', '905', '914', '916', '950']) assert.equal(g[gone], undefined, gone);
    assert.deepEqual(g.fa_hard!.inputs, { image: names.hardMaskName, channel: 'red' });
    // The input graph is left as it was.
    assert.equal((rapid['8'].inputs as { seed: number }).seed, 1);
    assert.deepEqual(rapid['4'].inputs.image2, ['903', 0]);
  });

  it('the still variant uses the still itself as Image 1 and drops the fill', () => {
    const built = buildFixAreaGraph(rapid, { ...names, seed: 7, denoise: 0.75, reference: 'still' });
    assert.ok(built);
    assert.deepEqual(built.graph['4']!.inputs.image1, ['fa_still', 0]);
    assert.deepEqual(built.graph.fa_encode!.inputs.pixels, ['fa_still', 0]);
    assert.equal(built.graph.fa_fill, undefined);
    assert.equal(built.graph['8']!.inputs.denoise, 0.75);
    assert.match(String(built.graph['4']!.inputs.prompt), new RegExp(`Fix only the marked area: ${FIX_AREA_DEFAULT_TEXT}\\. Keep everything else`));
  });

  it('patches a Qwen-Image 2.1 still: images.image_1, noise seed, trimmed sigmas', () => {
    const built = buildFixAreaGraph(qwen21, { ...names, seed: 99, denoise: 0.75, reference: 'grey' });
    assert.ok(built);
    const g = built.graph;
    assert.deepEqual(g['923']!.inputs['images.image_1'], ['fa_fill', 0]);
    assert.equal('images.image_2' in g['923']!.inputs, false);
    assert.equal(g['925']!.inputs.noise_seed, 99);
    assert.equal(g['928']!.inputs.sigmas, '0.750000, 0.500000, 0.200000, 0.000000');
    assert.deepEqual(g['8']!.inputs.latent_image, ['fa_latent', 0]);
    assert.deepEqual(g.fa_composite!.inputs.source, ['9', 0]);
    assert.equal(g['903'], undefined);
    assert.equal(built.edit, true);
  });

  it('patches a text-to-image still: only the latent, seed and prompt', () => {
    const built = buildFixAreaGraph(sdxl, { ...names, seed: 11, denoise: 0.75, reference: 'grey', text: 'no person' });
    assert.ok(built);
    assert.equal(built.edit, false);
    assert.match(String(built.graph['2']!.inputs.text), /a red bicycle\nFix only the marked area: no person\./);
    assert.equal(built.graph['3']!.inputs.text, 'blurry');
    assert.equal(built.graph['4'], undefined);
  });

  it('returns null for graphs it cannot re-render', () => {
    assert.equal(buildFixAreaGraph(null, { ...names, seed: 1, denoise: 1, reference: 'grey' }), null);
    const faceFinish = {
      '1': { class_type: 'LoadImage', inputs: { image: 'still.png' } },
      '23': { class_type: 'FaceDetailer', inputs: { image: ['1', 0] } },
      '99': { class_type: 'SaveImage', inputs: { images: ['23', 0], filename_prefix: 'Castcut-face-finish' } },
    };
    assert.equal(buildFixAreaGraph(faceFinish, { ...names, seed: 1, denoise: 1, reference: 'grey' }), null);
  });

  it('Fix the face: the Cast face is Image 2 of the positive encoder, with the identity line', () => {
    const built = buildFixAreaGraph(rapid, { ...names, seed: 5, denoise: 1, reference: 'grey', mode: 'face', faceName: 'day-face.png' });
    assert.ok(built);
    assert.equal(built.identity, true);
    assert.deepEqual(built.graph['4']!.inputs.image1, ['fa_fill', 0]);
    assert.deepEqual(built.graph['4']!.inputs.image2, ['fa_face', 0]);
    assert.equal('image2' in built.graph['5']!.inputs, false, 'the negative encoder reads no face');
    assert.deepEqual(built.graph.fa_face!.inputs, { image: 'day-face.png' });
    assert.match(String(built.graph['4']!.inputs.prompt), new RegExp(`Fix only the marked area: ${FIX_AREA_FACE_TEXT}\\. The face is the same person as the face reference Image 2`));
    // Qwen-Image 2.1 names its pictures <imageN>.
    const q = buildFixAreaGraph(qwen21, { ...names, seed: 5, denoise: 1, reference: 'grey', mode: 'face', faceName: 'face.png', text: 'her face' });
    assert.ok(q);
    assert.equal(q.identity, true);
    assert.deepEqual(q.graph['923']!.inputs['images.image_2'], ['fa_face', 0]);
    assert.match(String(q.graph['923']!.inputs.prompt), /Fix only the marked area: her face\. The face is the same person as the face reference <image2>/);
    // A text-to-image still has no image channel: no face node, the plain line.
    const t = buildFixAreaGraph(sdxl, { ...names, seed: 5, denoise: 1, reference: 'grey', mode: 'face', faceName: 'face.png' });
    assert.ok(t);
    assert.equal(t.identity, false);
    assert.equal(t.graph.fa_face, undefined);
    assert.match(String(t.graph['2']!.inputs.text), new RegExp(`Fix only the marked area: ${FIX_AREA_FACE_TEXT}\\. The flat grey`));
    // Mode area never adds the face even when a name is given.
    const a = buildFixAreaGraph(rapid, { ...names, seed: 5, denoise: 1, reference: 'grey', mode: 'area', faceName: 'day-face.png' });
    assert.equal(a?.identity, false);
    assert.equal('image2' in a!.graph['4']!.inputs, false);
  });

  it('finds the identity pictures a still was made with', () => {
    assert.deepEqual(findFixAreaIdentityImages(rapid), { face: 'day-face.png', plate: 'day-dress-plate.png' });
    const plateOnly = { ...rapid, '900': { class_type: 'LoadImage', inputs: { image: 'tomas-cutout.png' } } };
    assert.deepEqual(findFixAreaIdentityImages(plateOnly), { face: null, plate: 'tomas-cutout.png' });
    const guidesOnly = { ...rapid, '900': { class_type: 'LoadImage', inputs: { image: 'day-pose-guide-face-x.png' } }, '903': { class_type: 'LoadImage', inputs: { image: 'day-partner-vl-1.png' } } };
    assert.deepEqual(findFixAreaIdentityImages(guidesOnly), { face: null, plate: null });
    assert.deepEqual(findFixAreaIdentityImages(sdxl), { face: null, plate: null });
  });

  it('face box, mask bounds and the zoom window', () => {
    const box = faceFixBox({ x: 400, y: 200, width: 100, height: 120 }, { width: 1000, height: 1000 });
    assert.ok(Math.abs(box.width - 0.15) < 1e-9 && Math.abs(box.height - 0.21) < 1e-9);
    assert.ok(box.x < 0.4 && box.x + box.width > 0.5, 'wider than the face');
    assert.ok(box.y < 0.2, 'lifted toward the hair');
    const clamped = faceFixBox({ x: 0, y: 0, width: 100, height: 100 }, { width: 120, height: 120 });
    assert.equal(clamped.x, 0);
    assert.equal(clamped.y, 0);
    assert.ok(clamped.x + clamped.width <= 1 && clamped.y + clamped.height <= 1);

    const mask = new Uint8Array(10 * 10);
    mask[3 * 10 + 4] = 255;
    mask[6 * 10 + 7] = 200;
    assert.deepEqual(maskBoundsFraction(mask, { width: 10, height: 10 }), { x: 0.4, y: 0.3, width: 0.4, height: 0.4 });
    assert.equal(maskBoundsFraction(new Uint8Array(100), { width: 10, height: 10 }), null);
    // RGBA data, red channel.
    const rgba = new Uint8Array(4 * 4);
    rgba.set([255, 255, 255, 255], 2 * 4);
    assert.deepEqual(maskBoundsFraction(rgba, { width: 2, height: 2 }, 4), { x: 0, y: 0.5, width: 0.5, height: 0.5 });

    const zoom = fixAreaZoomWindow({ x: 0.4, y: 0.3, width: 0.1, height: 0.1 }, 0.75)!;
    assert.ok(zoom.width >= FIX_AREA_ZOOM_MIN / 0.75 - 1e-9 && zoom.height >= FIX_AREA_ZOOM_MIN - 1e-9, 'never smaller than the minimum window');
    assert.ok(zoom.x <= 0.4 && zoom.x + zoom.width >= 0.5 && zoom.y <= 0.3 && zoom.y + zoom.height >= 0.4, 'contains the box');
    assert.ok(zoom.x >= 0 && zoom.y >= 0 && zoom.x + zoom.width <= 1 + 1e-9 && zoom.y + zoom.height <= 1 + 1e-9, 'inside the picture');
    const corner = fixAreaZoomWindow({ x: 0.95, y: 0.95, width: 0.05, height: 0.05 }, 1)!;
    assert.ok(corner.x + corner.width <= 1 + 1e-9 && corner.y + corner.height <= 1 + 1e-9);
    assert.ok(corner.x + corner.width >= 1 - 1e-9, 'kept inside by sliding, not cut');
    assert.equal(fixAreaZoomWindow(null, 1), null);
    const whole = fixAreaZoomWindow({ x: 0, y: 0, width: 1, height: 1 }, 0.75)!;
    assert.ok(Math.abs(whole.width - 1) < 1e-9 && Math.abs(whole.height - 1) < 1e-9);
  });

  it('reads the still prompt', () => {
    assert.equal(readFixAreaStillPrompt(rapid), 'Edit Image 1: a woman at a café table.');
    assert.equal(readFixAreaStillPrompt(qwen21), 'Edit <image1>: a walk.');
  });

  it('an area runs grey at full denoise, a face the still at half; a harness may pick either', () => {
    assert.deepEqual(resolveFixAreaRun({ mode: 'area' }), { reference: 'grey', denoise: 1 });
    assert.deepEqual(resolveFixAreaRun({ mode: 'area', reference: 'grey', denoise: 0.75 }), { reference: 'grey', denoise: 1 });
    assert.deepEqual(resolveFixAreaRun({ mode: 'face' }), { reference: FIX_AREA_FACE_REFERENCE, denoise: FIX_AREA_FACE_DENOISE });
    assert.deepEqual(resolveFixAreaRun({ mode: 'face', reference: 'grey' }), { reference: 'grey', denoise: 1 });
    assert.deepEqual(resolveFixAreaRun({ mode: 'area', reference: 'still', denoise: '0.4' }), { reference: 'still', denoise: 0.4 });
    assert.deepEqual(resolveFixAreaRun({ mode: 'area', reference: 'still' }), { reference: 'still', denoise: 1 });
  });

  it('normalizes the text, denoise, sigmas and seeds', () => {
    assert.equal(normalizeFixAreaText('  a   red cup.  '), 'a red cup');
    assert.equal(normalizeFixAreaText('x'.repeat(400)).length, 300);
    assert.match(fixAreaPromptLine('', 'grey'), new RegExp(FIX_AREA_DEFAULT_TEXT));
    assert.equal(normalizeFixAreaDenoise('0.756'), 0.76);
    assert.equal(normalizeFixAreaDenoise(5), 1);
    assert.equal(normalizeFixAreaDenoise(undefined), 1);
    assert.equal(trimSigmasForDenoise('1, 0.5, 0', 1), '1, 0.5, 0');
    const seeds = fixAreaSeeds(2, () => 0.5);
    assert.equal(seeds.length, 2);
    assert.notEqual(seeds[0], seeds[1]);
  });
});
