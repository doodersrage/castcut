import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appInputCategory,
  buildInputCleanupCommand,
  collectInputNameTokens,
  comfyInputDirFromArgv,
  findUnreferencedAppInputs,
  INPUT_CLEANUP_MIN_AGE_MS,
  isAppMadeInputName,
  parseComfyInputListing,
  shellQuote,
} from './comfy-input-cleanup';

const NOW = Date.UTC(2026, 9, 3);
const OLD = NOW - INPUT_CLEANUP_MIN_AGE_MS - 1000;
const NEW = NOW - 1000;

describe('comfy-input-cleanup', () => {
  it('recognises the app’s own uploads and nothing else', () => {
    assert.equal(appInputCategory('day-nude-face-1791063803863.png'), 'day-nude-face');
    assert.equal(appInputCategory('day-pose-guide-solo-963a20-x1-1791063798315.png'), 'day-pose-guide');
    assert.equal(appInputCategory('cast-plate-base-1790559828680.png'), 'cast-plate');
    assert.equal(appInputCategory('castcut-isolate-0123456789abcdef.png'), 'castcut-isolate');
    assert.equal(appInputCategory('Nora-umuro9zni-cutout.png'), 'cut-out');
    assert.equal(appInputCategory('image-cutout-umuro9zni.png'), 'cut-out');
    assert.equal(appInputCategory('IMG_0001-0123456789abcdef.jpg'), 'content-named');
    assert.equal(appInputCategory('IMG_0001-umuro9zni.jpg'), 'stamped upload');
    // Other people's files.
    for (const name of [
      'PromptStudio_00163_.png',
      'wallhaven-xe8kwz.png',
      'Gemini_Generated_Image_r4epvmr4epvmr4ep.png',
      'klein-ab-face-Castcut_00309_-up.png',
      'ffab-test-0001.png',
      'day-pose-guide', // no extension
      'cast-plateau.png', // prefix must end at a separator
      'day-nude-face 1.png', // a name the reference scan cannot find as one token
      '../day-nude-face-1.png',
    ]) {
      assert.equal(isAppMadeInputName(name), false, name);
    }
  });

  it('finds names inside saved JSON, URLs and graphs', () => {
    const tokens = collectInputNameTokens(
      JSON.stringify({
        imageUrl: '/api/comfyui/view?filename=day-nude-face-1.png&type=input&subfolder=',
        workflow: { '12': { class_type: 'LoadImage', inputs: { image: 'sub/cast-plate-a.png' } } },
        note: 'Nora is here',
      }),
      new Set(),
      isAppMadeInputName
    );
    assert.deepEqual([...tokens].sort(), ['cast-plate-a.png', 'day-nude-face-1.png']);
  });

  it('keeps referenced, new and foreign files; lists the rest', () => {
    const result = findUnreferencedAppInputs({
      now: NOW,
      referenced: new Set(['day-nude-face-used.png']),
      files: [
        { name: 'day-nude-face-used.png', size: 10, mtimeMs: OLD },
        { name: 'day-nude-face-old.png', size: 20, mtimeMs: OLD },
        { name: 'day-nude-face-old.png', size: 20, mtimeMs: OLD }, // listed twice
        { name: 'day-pose-guide-solo-1.png', size: 5, mtimeMs: OLD },
        { name: 'day-nude-face-fresh.png', size: 30, mtimeMs: NEW },
        { name: 'day-nude-face-unknown-age.png', size: 30 },
        { name: 'PromptStudio_00163_.png', size: 99, mtimeMs: OLD },
      ],
    });
    assert.deepEqual(
      result.removable.map(file => file.name),
      ['day-nude-face-old.png', 'day-pose-guide-solo-1.png']
    );
    assert.equal(result.removableBytes, 25);
    assert.deepEqual(
      result.tooNew.map(file => file.name),
      ['day-nude-face-fresh.png', 'day-nude-face-unknown-age.png']
    );
    assert.equal(result.referencedCount, 1);
    assert.equal(result.appMadeCount, 5);
    assert.equal(result.appMadeBytes, 95);
    assert.deepEqual(result.byCategory, [
      { category: 'day-nude-face', count: 1, bytes: 20 },
      { category: 'day-pose-guide', count: 1, bytes: 5 },
    ]);
  });

  it('builds an rm command with quoted full paths, app-made names only', () => {
    const command = buildInputCleanupCommand({
      inputDir: '/var/lib/comfyui/input/',
      names: ['day-nude-face-1.png', "day-nude-face-o'brien.png", 'PromptStudio_00163_.png', 'cast-plate-2.png'],
      perLine: 1,
    });
    assert.equal(
      command,
      [
        "rm -- '/var/lib/comfyui/input/day-nude-face-1.png'",
        "rm -- '/var/lib/comfyui/input/cast-plate-2.png'",
      ].join('\n')
    );
    assert.equal(buildInputCleanupCommand({ inputDir: null, names: [] }), '');
    assert.match(
      buildInputCleanupCommand({ inputDir: null, names: ['cast-plate-2.png'] }),
      /^rm -- '\/path\/to\/ComfyUI\/input\/cast-plate-2.png'$/
    );
    assert.equal(shellQuote("a'b"), `'a'\\''b'`);
  });

  it('reads ComfyUI’s listing and input folder', () => {
    assert.deepEqual(
      parseComfyInputListing(['a.png [input]', '3d/model.glb [input]', 5, 'b.png']),
      ['a.png', 'b.png']
    );
    assert.deepEqual(parseComfyInputListing({}), []);
    assert.equal(
      comfyInputDirFromArgv(['/opt/comfyui/main.py', '--input-directory', '/var/lib/comfyui/input']),
      '/var/lib/comfyui/input'
    );
    assert.equal(comfyInputDirFromArgv(['main.py', '--input-directory=/srv/in']), '/srv/in');
    assert.equal(comfyInputDirFromArgv(['/opt/comfyui/main.py', '--listen']), '/opt/comfyui/input');
    assert.equal(comfyInputDirFromArgv(['main.py']), null);
    assert.equal(comfyInputDirFromArgv(undefined), null);
  });
});
