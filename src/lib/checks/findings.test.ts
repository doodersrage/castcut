import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findingsForGalleryEntry } from './findings';

describe('continuity findings, one shape (M2 C1)', () => {
  it('reads every check a render carries as a finding with its evidence', () => {
    const findings = findingsForGalleryEntry(
      {
        promptId: 'p1',
        playChecks: {
          face: 0.412,
          faceMiss: true,
          pose: 0.3,
          poseMiss: true,
          marksMissing: 'rose tattoo on the left forearm',
          clipCutAt: 3.25,
          clipSilent: true,
          at: 1,
        },
        adultCheck: { state: 'withheld', cause: 'age', at: 1 },
        playerVerdict: { verdict: 'looks-wrong', at: 2 },
      },
      { imageUrl: '/api/gallery/media/p1' }
    );
    assert.deepEqual(
      findings.map(f => [f.id, f.severity]),
      [
        ['p1:adult-withheld', 'blocks'],
        ['p1:face-miss', 'warns'],
        ['p1:pose-miss', 'warns'],
        ['p1:marks-missing', 'warns'],
        ['p1:clip-cuts', 'warns'],
        ['p1:clip-silent', 'warns'],
        ['p1:looks-wrong', 'warns'],
      ]
    );
    const byRule = Object.fromEntries(findings.map(f => [f.rule, f]));
    assert.equal(byRule['face-miss']!.evidence, 'Face match 41%');
    assert.equal(byRule['pose-miss']!.evidence, 'Pose match 30%');
    assert.match(byRule['marks-missing']!.evidence, /rose tattoo/);
    assert.equal(byRule['clip-cuts']!.evidence, 'Cuts to another shot at 3.3 s');
    assert.equal(byRule['adult-withheld']!.evidence, 'Did not read as clearly adult');
    assert.ok(findings.every(f => f.evidenceUrl === '/api/gallery/media/p1' && f.suggestion));
  });

  it('says nothing about a render that passed, or one with no checks', () => {
    assert.deepEqual(
      findingsForGalleryEntry({
        promptId: 'ok',
        playChecks: { face: 0.8, pose: 0.9, at: 1 },
        adultCheck: { state: 'passed', at: 1 },
        playerVerdict: { verdict: 'kept', at: 1 },
      }),
      []
    );
    assert.deepEqual(findingsForGalleryEntry({ promptId: 'bare' }), []);
    assert.deepEqual(findingsForGalleryEntry({ promptId: '  ', playerVerdict: { verdict: 'looks-wrong', at: 1 } }), []);
  });

  it('keeps the same ids for the same render, so a decision can attach to them', () => {
    const entry = { promptId: 'p9', playChecks: { faceMiss: true, at: 1 } };
    assert.deepEqual(
      findingsForGalleryEntry(entry).map(f => f.id),
      findingsForGalleryEntry({ ...entry, playChecks: { faceMiss: true, face: 0.2, at: 5 } }).map(f => f.id)
    );
    // A bare-skin withhold says so.
    const bare = findingsForGalleryEntry({ promptId: 'p2', adultCheck: { state: 'withheld', cause: 'bare', at: 1 } });
    assert.equal(bare[0]!.evidence, 'Bare skin on a clothed still');
    assert.equal(findingsForGalleryEntry({ promptId: 'p3', playChecks: { faceMiss: true, at: 1 } })[0]!.evidence, 'Face match low');
  });

  // M6: an assembled film was clip-checked — a film of stills "cut midway" and "came out silent".
  it("an assembled film's own cuts and silence are not findings", () => {
    const checks = { clipCutAt: 8.9, clipSilent: true, at: 1 };
    assert.deepEqual(
      findingsForGalleryEntry({ promptId: 'film-1', derivedKind: 'film', playChecks: checks }),
      []
    );
    assert.equal(findingsForGalleryEntry({ promptId: 'clip-1', playChecks: checks }).length, 2);
  });
});
