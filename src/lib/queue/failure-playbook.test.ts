import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveFilmFailurePlaybook,
  resolveQueueFailureGuideLabel,
  resolveQueueFailureHref,
  resolveQueueFailurePlaybook,
} from './failure-playbook';
import { settingsTabHref } from '../settings/nav';

describe('resolveQueueFailureHref', () => {
  it('routes missing custom nodes to workflow map', () => {
    const href = resolveQueueFailureHref(
      'Workflow node type “FooBar” is not installed in ComfyUI — install the custom node pack.'
    );
    assert.ok(href);
    assert.match(href!, /workflow-map|comfyui/i);
  });

  it('routes LoRA and loader issues', () => {
    assert.match(resolveQueueFailureHref('LoRA stack invalid') ?? '', /lora/i);
    assert.match(resolveQueueFailureHref('checkpoint filename missing') ?? '', /model-assets|comfyui/i);
  });

  it('routes Diffusers, batch, object_info, and OOM failures', () => {
    assert.match(
      resolveQueueFailureHref('Diffusers queue failed: connection refused') ?? '',
      /inference-engine|comfyui/i
    );
    assert.equal(resolveQueueFailureHref('Batch queued with 2 failure(s)'), '/queue');
    assert.match(
      resolveQueueFailureHref('object_info missing node type FooBar') ?? '',
      /workflow-map|comfyui/i
    );
    assert.match(resolveQueueFailureHref('CUDA out of memory') ?? '', /vram|comfyui/i);
    assert.match(resolveQueueFailureHref('ComfyUI unauthorized 401') ?? '', /connection|comfyui/i);
  });

  it('routes stuck polls, empty outputs, and half-healed hosts', () => {
    assert.equal(
      resolveQueueFailureHref(
        'Timed out waiting for ComfyUI — open Queue to claim orphans or import history'
      ),
      '/queue'
    );
    assert.equal(resolveQueueFailureHref('Job finished — waiting for output files…'), '/queue');
    assert.match(
      resolveQueueFailureHref(
        'Could not read object_info from http://127.0.0.1:8188 — still booting'
      ) ?? '',
      /overview|settings/i
    );
    assert.match(
      resolveQueueFailureHref('ComfyUI restart requested; host did not answer in time') ?? '',
      /overview|settings/i
    );
  });

  it('returns undefined for generic failures', () => {
    assert.equal(resolveQueueFailureHref('Something went wrong'), undefined);
  });

  it('routes identity lock and stale reference failures to connection', () => {
    assert.match(
      resolveQueueFailureHref('LoadImage: face.png not found in input folder') ?? '',
      /connection|comfyui/i
    );
    assert.match(
      resolveQueueFailureHref('IP-Adapter image file missing on pinned host') ?? '',
      /connection|comfyui/i
    );
  });

  it('routes inpaint mask failures to the inpaint tool', () => {
    assert.equal(
      resolveQueueFailureHref('Draw or upload an inpaint mask before queueing.'),
      '/inpaint'
    );
  });

  it('routes cloud engine and API key failures to inference engine', () => {
    assert.match(resolveQueueFailureHref('Fal queue failed: unauthorized') ?? '', /inference-engine/i);
    assert.match(
      resolveQueueFailureHref('Unknown cloud engine "foo"') ?? '',
      /inference-engine/i
    );
    assert.match(
      resolveQueueFailureHref('Replicate API key is required') ?? '',
      /inference-engine/i
    );
  });

  it('routes IndexedDB quota and unresolved placeholder tokens', () => {
    assert.match(
      resolveQueueFailureHref('Browser storage IndexedDB quota exceeded') ?? '',
      /data|settings/i
    );
    assert.match(
      resolveQueueFailureHref('Unresolved placeholder token {{prompt}} missing in workflow') ?? '',
      /workflow-map|comfyui/i
    );
  });

  it('routes ffmpeg and film assemble failures to settings overview', () => {
    assert.equal(
      resolveQueueFailureHref('ffmpeg is missing on the server — install ffmpeg to encode films.'),
      settingsTabHref('overview')
    );
    assert.equal(
      resolveQueueFailureHref('Could not assemble the film — server film encode unavailable.'),
      settingsTabHref('overview')
    );
    assert.equal(
      resolveQueueFailureHref('Server film encode unavailable (HTTP 503).'),
      settingsTabHref('overview')
    );
    assert.equal(
      resolveQueueFailureHref('empty playlist — no completed shots for film assemble'),
      settingsTabHref('overview')
    );
    assert.equal(
      resolveQueueFailureHref('MediaRecorder fallback failed after empty playlist'),
      settingsTabHref('overview')
    );
  });
});

describe('resolveQueueFailureGuideLabel', () => {
  it('labels common playbook routes', () => {
    assert.equal(resolveQueueFailureGuideLabel('/inpaint'), 'Open Inpaint');
    assert.equal(resolveQueueFailureGuideLabel('/queue'), 'Open Queue');
    assert.equal(
      resolveQueueFailureGuideLabel('/settings?tab=comfyui&section=vram-guard'),
      'VRAM settings'
    );
    assert.equal(
      resolveQueueFailureGuideLabel('/settings?tab=comfyui&section=workflow-map'),
      'Workflow map'
    );
    assert.equal(resolveQueueFailureGuideLabel(settingsTabHref('overview')), 'Open settings');
  });
});

describe('resolveFilmFailurePlaybook', () => {
  it('keeps the message and always supplies an overview href for film failures', () => {
    const ffmpeg = resolveFilmFailurePlaybook(
      'ffmpeg is missing on the server — install ffmpeg to encode films.'
    );
    assert.match(ffmpeg.message, /ffmpeg/i);
    assert.equal(ffmpeg.href, settingsTabHref('overview'));

    const generic = resolveFilmFailurePlaybook('Something opaque went wrong');
    assert.equal(generic.message, 'Something opaque went wrong');
    assert.equal(generic.href, settingsTabHref('overview'));

    const empty = resolveFilmFailurePlaybook('   ');
    assert.match(empty.message, /assemble/i);
    assert.equal(empty.href, settingsTabHref('overview'));
  });
});

describe('resolveQueueFailurePlaybook', () => {
  it('prefers structured issue href over regex', () => {
    const playbook = resolveQueueFailurePlaybook([
      {
        severity: 'error',
        message: 'Workflow node type “X” is not installed in ComfyUI',
        href: '/settings?tab=comfyui&section=workflow-map',
      },
    ]);
    assert.equal(playbook.href, '/settings?tab=comfyui&section=workflow-map');
    assert.match(playbook.message, /not installed/i);
  });
});
