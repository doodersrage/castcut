import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_MIN_FACE_MATCH,
  describeFaceMatch,
  faceSimilarityFromDistance,
  FACE_MATCH_WARN_BELOW,
  parseFaceDistance,
} from './face-match';
import { comfyInputViewUrl } from './face-match-client';
import { comfyOutputIndex } from './face-match-server';
import { fillComfyNodeInputs } from './comfy-utility-graph-server';
import { decideSlotQuality, type SlotQualityReport } from './play-slot-quality';
import { storyFaceMatchLabel } from './roleplay-pose-check';
import { faceMatchSummary } from './play-metrics';

describe('face match parsing', () => {
  it('reads the distance PreviewAny shows in any of its shapes', () => {
    assert.equal(parseFaceDistance('0.412'), 0.412);
    assert.equal(parseFaceDistance(0.25), 0.25);
    assert.equal(parseFaceDistance('[0.3]'), 0.3);
    assert.equal(parseFaceDistance(['0.5']), 0.5);
    assert.equal(parseFaceDistance('distance: 0.61'), 0.61);
    assert.equal(parseFaceDistance(''), null);
    assert.equal(parseFaceDistance(undefined), null);
  });

  it('turns cosine and L2 distances into a 0–1 similarity', () => {
    assert.equal(faceSimilarityFromDistance(0.3, 'cosine'), 0.7);
    assert.equal(faceSimilarityFromDistance(1.4, 'cosine'), 0);
    assert.ok(Math.abs(faceSimilarityFromDistance(0.8, 'L2_norm') - 0.68) < 1e-9);
    assert.equal(describeFaceMatch(0.734), 'face match 73%');
  });
});

describe('face check graph helpers', () => {
  it('fills widgets from defaults and only applies overrides the node offers', () => {
    const info = {
      input: {
        required: {
          analysis_models: ['ANALYSIS_MODELS'],
          reference: ['IMAGE'],
          image: ['IMAGE'],
          similarity_metric: [['L2_norm', 'cosine', 'euclidean']],
          filter_thresh: ['FLOAT', { default: 100 }],
          generate_image_overlay: ['BOOLEAN', { default: true }],
        },
      },
      output: ['IMAGE', 'FLOAT'],
    };
    const inputs = fillComfyNodeInputs(
      info as never,
      { analysis_models: ['3', 0], reference: ['1', 0], image: ['2', 0] },
      { similarity_metric: 'cosine', generate_image_overlay: false, missing_widget: 1 }
    );
    assert.deepEqual(inputs, {
      analysis_models: ['3', 0],
      reference: ['1', 0],
      image: ['2', 0],
      similarity_metric: 'cosine',
      filter_thresh: 100,
      generate_image_overlay: false,
    });
    const noCosine = fillComfyNodeInputs(
      { input: { required: { similarity_metric: [['L2_norm']] } } } as never,
      {},
      { similarity_metric: 'cosine' }
    );
    assert.equal(noCosine.similarity_metric, 'L2_norm');
    assert.equal(comfyOutputIndex(info as never, 'FLOAT'), 1);
  });

  it('builds view URLs for input-folder plates', () => {
    assert.equal(
      comfyInputViewUrl('plates/cast.png'),
      '/api/comfyui/view?filename=cast.png&subfolder=plates&type=input'
    );
    assert.equal(comfyInputViewUrl(''), null);
  });
});

describe('face match in the Day quality gate', () => {
  const clean: SlotQualityReport = {
    faceIntegrity: 5,
    outfitMatch: 5,
    anatomy: 5,
    flags: ['wrong-face'],
    note: '',
  };

  it('rerolls a different person, warns on a weak match, and outranks the vision guess', () => {
    const miss = decideSlotQuality({ ...clean, flags: [] }, 0, undefined, { faceMatch: 0.2 });
    assert.equal(miss.action, 'reroll');
    assert.equal(miss.faceMiss, true);
    assert.match(miss.reasons[0]!, /face match 20% — not the Cast/);
    const weak = decideSlotQuality({ ...clean, flags: [] }, 0, undefined, { faceMatch: 0.4 });
    assert.equal(weak.action, 'keep');
    assert.deepEqual(weak.warnings, ['face match 40%']);
    // Measured 0.7: the vision reviewer's wrong-face flag is not repeated as a warning.
    const good = decideSlotQuality(clean, 0, undefined, { faceMatch: 0.7 });
    assert.deepEqual(good.warnings, []);
    // Not measured: the vision warning still shows.
    assert.deepEqual(decideSlotQuality(clean, 0).warnings, ['face may not match the Cast']);
  });
});

describe('Story face match label', () => {
  const beat = { imageUrl: 'a.png' };
  const thresholds = { miss: DEFAULT_MIN_FACE_MATCH, warn: FACE_MATCH_WARN_BELOW };

  it('labels miss, warn and pass for the shown still only', () => {
    assert.equal(
      storyFaceMatchLabel({ ...beat, faceMatch: { imageUrl: 'a.png', similarity: 0.1 } }, thresholds)
        ?.miss,
      true
    );
    assert.match(
      storyFaceMatchLabel({ ...beat, faceMatch: { imageUrl: 'a.png', similarity: 0.4 } }, thresholds)!
        .text,
      /worth a look/
    );
    assert.equal(
      storyFaceMatchLabel({ ...beat, faceMatch: { imageUrl: 'a.png', similarity: 0.8 } }, thresholds)
        ?.text,
      'Face match 80%'
    );
    assert.equal(
      storyFaceMatchLabel({ ...beat, faceMatch: { imageUrl: 'b.png', similarity: 0.8 } }, thresholds),
      null
    );
  });
});

describe('face match metrics', () => {
  it('ranks models by mean face match', () => {
    const summary = faceMatchSummary({
      version: 1,
      faceMatch: {
        'rapid-aio': { sum: 1.2, count: 2, misses: 1 },
        'edit-2511': { sum: 2.4, count: 3, misses: 0 },
      },
    });
    assert.deepEqual(
      summary.map(entry => entry.model),
      ['edit-2511', 'rapid-aio']
    );
    assert.equal(summary[1]!.missRate, 0.5);
  });
});
