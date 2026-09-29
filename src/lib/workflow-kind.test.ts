import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { modelWorkflowKind, pickWorkflowForModelKind, workflowFileKind } from './workflow-kind';
import { auditModelWorkflowMapKinds } from './workflow-health-audit';

const graph = (classes: string[], tokens = '') =>
  JSON.stringify(
    Object.fromEntries(
      classes.map((class_type, index) => [String(index + 1), { class_type, inputs: { note: tokens } }])
    )
  );

// Shapes of real library scaffolds: the 3D and audio ones are image graphs with media tokens.
const mesh3d = {
  id: 'mesh',
  name: 'Hunyuan 3D scaffold',
  createdAt: 1,
  workflowJson: graph(['CheckpointLoaderSimple', 'KSampler', 'EmptyLatentImage', 'SaveImage'], '{{MESH_RESOLUTION}}'),
};
const wan = {
  id: 'wan',
  name: 'WAN Video scaffold',
  createdAt: 1,
  workflowJson: graph(['CheckpointLoaderSimple', 'EmptyHunyuanLatentVideo', 'KSampler', 'SaveAnimatedWEBP'], '{{VIDEO_FRAMES}}'),
};
const audio = {
  id: 'audio',
  name: 'Stable Audio scaffold',
  createdAt: 1,
  workflowJson: graph(['CheckpointLoaderSimple', 'KSampler', 'SaveAudio'], '{{AUDIO_SECONDS}}'),
};
const image = {
  id: 'img',
  name: 'Qwen-image-2512',
  createdAt: 1,
  workflowJson: graph(['UNETLoader', 'KSampler', 'SaveImage']),
};

describe('workflow-kind', () => {
  it('reads kind from nodes and tokens before the name', () => {
    assert.equal(workflowFileKind(mesh3d), 'mesh');
    assert.equal(workflowFileKind(wan), 'video');
    assert.equal(workflowFileKind(audio), 'audio');
    assert.equal(workflowFileKind(image), 'image');
    assert.equal(workflowFileKind({ name: 'hunyuan 3d thing', workflowJson: '{}' }), 'mesh');
  });

  it('knows which kind each model needs and skips non-model keys', () => {
    assert.equal(modelWorkflowKind('wan-video-rapid-aio'), 'video');
    assert.equal(modelWorkflowKind('hunyuan-3d'), 'mesh');
    assert.equal(modelWorkflowKind('qwen-image-2512'), 'image');
    assert.equal(modelWorkflowKind('faceDetailer'), null);
  });

  it('never picks the 3D scaffold for a video model', () => {
    const files = [mesh3d, image, wan];
    assert.equal(pickWorkflowForModelKind(files, 'hunyuan-video')?.id, 'wan');
    assert.equal(pickWorkflowForModelKind(files, 'ltx-video')?.id, 'wan');
    assert.equal(pickWorkflowForModelKind([mesh3d, image], 'hunyuan-video'), undefined);
  });

  it('flags video models mapped to the 3D scaffold and offers the video one', () => {
    const issues = auditModelWorkflowMapKinds([mesh3d, wan, audio, image], {
      'hunyuan-video': 'mesh',
      'ltx-video': 'mesh',
      'hunyuan-3d': 'mesh',
      'stable-audio': 'audio',
      faceDetailer: 'img',
      'qwen-image-2512': 'gone',
    });
    const byModel = Object.fromEntries(issues.map(issue => [issue.remap!.model, issue]));
    assert.deepEqual(Object.keys(byModel).sort(), ['hunyuan-video', 'ltx-video', 'qwen-image-2512']);
    assert.equal(byModel['hunyuan-video']!.remap!.workflowId, 'wan');
    assert.match(byModel['hunyuan-video']!.message, /needs a video workflow but is mapped to a 3D one/);
    assert.equal(byModel['qwen-image-2512']!.remap!.workflowId, 'img');
    assert.match(byModel['qwen-image-2512']!.message, /no longer in the library/);
  });

  it('judges nothing while the library has not loaded', () => {
    assert.deepEqual(auditModelWorkflowMapKinds([], { 'ltx-video': 'mesh', 'qwen-image-2512': 'gone' }), []);
  });
});

describe('map table row status', async () => {
  const { mapRowStatus } = await import('../components/settings/panels/ModelWorkflowMapTable');
  it('says when a pin is the wrong kind or missing', () => {
    assert.deepEqual(mapRowStatus('ltx-video', 'mesh', [mesh3d]), {
      tone: 'danger',
      text: 'Needs video, this is 3D',
    });
    assert.equal(mapRowStatus('ltx-video', 'wan', [wan]).tone, 'ok');
    assert.equal(mapRowStatus('faceDetailer', 'img', [image]).tone, 'ok');
    assert.match(mapRowStatus('qwen-image-2512', 'gone', [image]).text, /missing/i);
    assert.equal(mapRowStatus('qwen-image-2512', 'gone', []).text, 'Library loading…');
  });
});
