import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  stillReferenceRole,
  stillReferencesFromGraph,
  stillReferenceViewUrl,
} from './still-references';

describe('still references', () => {
  it('names each picture by the role the app uploaded it as', () => {
    assert.equal(stillReferenceRole('day-nude-face-abc.png'), 'face');
    assert.equal(stillReferenceRole('day-vacation-keep-day-1h4xlp4-27ad.png'), 'look');
    assert.equal(stillReferenceRole('day-dress-plate-feet-x.png'), 'shoes');
    assert.equal(stillReferenceRole('day-partner-vl-7cd4.png'), 'partner');
    assert.equal(stillReferenceRole('day-pose-guide-stairs-6220be-x1-312c.png'), 'pose');
    assert.equal(stillReferenceRole('ffab-day-end-pose-morning-1.png'), 'end-pose');
    assert.equal(stillReferenceRole('garment-123.png'), 'clothes');
    assert.equal(stillReferenceRole('prompt-studio-91f5.png'), 'picture');
  });

  it('reads LoadImage nodes once each, face first', () => {
    const graph = {
      '900': { class_type: 'LoadImage', inputs: { image: 'day-vacation-keep-a.png' } },
      '901': { class_type: 'LoadImage', inputs: { image: 'day-pose-guide-stand-b.png' } },
      '902': { class_type: 'LoadImage', inputs: { image: 'day-face-id-ref-c.png' } },
      '903': { class_type: 'LoadImage', inputs: { image: 'day-vacation-keep-a.png' } },
      '4': { class_type: 'TextEncodeQwenImageEditPlus', inputs: { image1: ['900', 0] } },
    };
    assert.deepEqual(
      stillReferencesFromGraph(graph).map(ref => [ref.role, ref.label]),
      [
        ['face', 'Face'],
        ['look', 'Look'],
        ['pose', 'Pose guide'],
      ]
    );
    assert.deepEqual(stillReferencesFromGraph(null), []);
  });

  it('views inputs through the proxy, subfolder split off', () => {
    assert.equal(stillReferenceViewUrl('a.png'), '/api/comfyui/view?filename=a.png&type=input');
    assert.equal(
      stillReferenceViewUrl('clipspace/a.png'),
      '/api/comfyui/view?filename=a.png&type=input&subfolder=clipspace'
    );
  });
});
