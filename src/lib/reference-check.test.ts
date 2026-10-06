import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FACE_REFERENCE_MIN_FACE_SHARE,
  isCastPlateReferenceName,
  judgeReference,
  referenceCheckCacheKey,
  referenceVerdictLabel,
  type ReferenceFacts,
} from './reference-check';

/** Live InsightFace reads of the user's own reference files (2026-10-05). */
const FACE_CROP: ReferenceFacts = {
  width: 1048,
  height: 1048,
  faces: 1,
  face: { x: 349, y: 378, width: 349, height: 453 },
};
const CAST_PLATE: ReferenceFacts = {
  width: 1992,
  height: 1992,
  faces: 1,
  face: { x: 944, y: 164, width: 157, height: 201 },
};
const MAN_IN_BOXERS: ReferenceFacts = {
  width: 1104,
  height: 1472,
  faces: 1,
  face: { x: 489, y: 128, width: 122, height: 161 },
};
/** The unrelated full-body character picture sent as the partner's face for four days. */
const FOX_GIRL: ReferenceFacts = {
  width: 1408,
  height: 1408,
  faces: 1,
  face: { x: 614, y: 118, width: 100, height: 116 },
};
const NO_FACE: ReferenceFacts = { width: 1024, height: 1024, faces: 0, face: null };
const TWO_FACES: ReferenceFacts = {
  width: 1024,
  height: 1024,
  faces: 2,
  face: { x: 100, y: 100, width: 300, height: 380 },
};

describe('judgeReference — face references', () => {
  it('passes a face crop', () => {
    const verdict = judgeReference('face', FACE_CROP, { filename: 'day-nude-face-1531c597f82e0aa1.png' });
    assert.equal(verdict.status, 'ok');
    assert.deepEqual(verdict.issues, []);
    assert.ok((verdict.faceShare ?? 0) > FACE_REFERENCE_MIN_FACE_SHARE);
  });

  it('fails whole-body plates as a face (the face is a tenth of the height)', () => {
    for (const facts of [CAST_PLATE, MAN_IN_BOXERS, FOX_GIRL]) {
      const verdict = judgeReference('face', facts, { filename: 'my-face.png', subject: 'Nora' });
      assert.equal(verdict.status, 'mismatch');
      assert.ok(verdict.issues.includes('face-too-small'));
      assert.match(verdict.message ?? '', /Nora's face picture is a whole-body picture, not a face crop — check Cast → Nora\./);
    }
  });

  it('fails a cast-plate file by name, even before the pixels are read', () => {
    const verdict = judgeReference('face', null, { filename: 'cast-plate-base-6eeb5f993672a860.png' });
    assert.equal(verdict.status, 'mismatch');
    assert.deepEqual(verdict.issues, ['cast-plate-name']);
    const viaUrl = judgeReference('face', CAST_PLATE, {
      filename: '/api/comfyui/view?filename=cast-plate-prepared-b37e0b418c552207.png&type=input',
    });
    assert.deepEqual(viaUrl.issues, ['cast-plate-name', 'face-too-small']);
  });

  it('fails no face / several faces', () => {
    assert.deepEqual(judgeReference('face', NO_FACE).issues, ['no-face']);
    assert.deepEqual(judgeReference('face', TWO_FACES).issues, ['extra-faces']);
    assert.match(judgeReference('face', NO_FACE, { subject: 'Sam' }).message ?? '', /Sam's face picture doesn't show a face/);
  });

  it('is unknown (fail open) when nothing could be measured', () => {
    const verdict = judgeReference('face', null, { filename: 'day-nude-face-abc.png', unavailableReason: 'ComfyUI offline' });
    assert.equal(verdict.status, 'unknown');
    assert.equal(verdict.message, 'ComfyUI offline');
    assert.equal(referenceVerdictLabel(verdict), 'Not checked — ComfyUI offline');
  });
});

describe('judgeReference — partner face', () => {
  it('passes the partner Cast face crop that matches their plate and not the lead', () => {
    const verdict = judgeReference(
      'partner-face',
      { ...FACE_CROP, similarity: { partner: 0.72, lead: 0.18 } },
      { subject: 'Tomas' }
    );
    assert.equal(verdict.status, 'ok');
  });

  it('fails the fox-girl picture (small face) and an unrelated person', () => {
    const fox = judgeReference('partner-face', { ...FOX_GIRL, similarity: { partner: 0.05, lead: 0.04 } }, { subject: 'Tomas' });
    assert.equal(fox.status, 'mismatch');
    assert.deepEqual(fox.issues, ['face-too-small', 'other-person']);
    assert.match(fox.message ?? '', /Tomas's face picture is a whole-body picture, not a face crop and shows someone else's face — check Cast → Tomas\./);
    const stranger = judgeReference('partner-face', { ...FACE_CROP, similarity: { partner: 0.12, lead: 0.1 } });
    assert.deepEqual(stranger.issues, ['other-person']);
  });

  it("fails the lead's own face sent as the partner", () => {
    const verdict = judgeReference('partner-face', { ...FACE_CROP, similarity: { partner: 0.2, lead: 0.8 } }, { subject: 'Tomas' });
    assert.deepEqual(verdict.issues, ['lead-face']);
    assert.match(verdict.message ?? '', /is the lead's face, not the partner's/);
  });

  it('does not judge similarity it could not measure', () => {
    const verdict = judgeReference('partner-face', { ...FACE_CROP, similarity: { partner: null, lead: null } });
    assert.equal(verdict.status, 'ok');
  });
});

describe('judgeReference — clothing and plates', () => {
  it('flags a face crop or a Cast plate used as the clothing image, passes a packshot and a dressed plate', () => {
    assert.deepEqual(judgeReference('clothing', FACE_CROP).issues, ['face-crop']);
    assert.deepEqual(judgeReference('clothing', null, { filename: 'cast-plate-base-1.png' }).issues, ['cast-plate-name']);
    assert.equal(judgeReference('clothing', NO_FACE, { filename: 'outfit-vl-1.png' }).status, 'ok');
    // A dressed plate: a whole person wearing the outfit — a small face is fine.
    assert.equal(judgeReference('clothing', CAST_PLATE, { filename: 'day-dress-plate-1.png' }).status, 'ok');
    assert.match(judgeReference('clothing', FACE_CROP).message ?? '', /The clothing picture is a face crop, not clothing — pick the clothing again\./);
  });

  it('a plate needs exactly one face, any size', () => {
    assert.equal(judgeReference('plate', CAST_PLATE).status, 'ok');
    assert.equal(judgeReference('plate', FACE_CROP).status, 'ok');
    assert.deepEqual(judgeReference('plate', NO_FACE).issues, ['no-face']);
    assert.deepEqual(judgeReference('plate', TWO_FACES).issues, ['extra-faces']);
  });
});

describe('helpers', () => {
  it('recognises Cast plate names in files and view URLs', () => {
    assert.equal(isCastPlateReferenceName('cast-plate-prepared-b37e0b418c552207.png'), true);
    assert.equal(isCastPlateReferenceName('/api/comfyui/view?filename=cast-plate-base-1.png&type=input'), true);
    assert.equal(isCastPlateReferenceName('day-nude-face-1.png'), false);
    assert.equal(isCastPlateReferenceName(''), false);
  });

  it('keys the cache by picture, role and (for a partner) what it is compared with', () => {
    const a = referenceCheckCacheKey({ role: 'face', filename: 'f.png', imageUrl: 'ignored-when-named' });
    const b = referenceCheckCacheKey({ role: 'face', filename: 'f.png' });
    assert.equal(a, b);
    assert.notEqual(a, referenceCheckCacheKey({ role: 'clothing', filename: 'f.png' }));
    assert.notEqual(
      referenceCheckCacheKey({ role: 'partner-face', filename: 'f.png', partnerReferenceUrl: '/p1' }),
      referenceCheckCacheKey({ role: 'partner-face', filename: 'f.png', partnerReferenceUrl: '/p2' })
    );
    // Other roles ignore the comparison pictures.
    assert.equal(
      referenceCheckCacheKey({ role: 'face', filename: 'f.png', partnerReferenceUrl: '/p1' }),
      referenceCheckCacheKey({ role: 'face', filename: 'f.png' })
    );
  });
});
