import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { resolveSceneGuidePlan, type SocialLayout } from './day-pose-guide';
import { dayPoseAsPhotoPose, dayPoseWords } from './day-pose-presets';
import { planDaySlotPose } from './day-slot-pose';
import { POSE_PICKER_GROUPS } from './pose-layout-labels';
import type { NormalizedBody } from './pose-library';
import { bodyCentreX } from './pose-starters';
import {
  normalizePoseReference,
  parsePoseReferences,
  POSE_REFERENCE_LICENCES,
  POSE_REFERENCE_SOURCES,
  poseReferenceCreditLine,
  poseReferenceCreditText,
  poseReferenceForVariant,
  poseReferencesFor,
  type PoseReference,
} from './pose-references';

const DATA_PATH = join(process.cwd(), 'src/lib/data/pose-references.json');
const raw = JSON.parse(readFileSync(DATA_PATH, 'utf8')) as { references: unknown[] };
const references = parsePoseReferences(raw);

const PICKER_IDS = new Set(POSE_PICKER_GROUPS.flatMap(group => group.ids));
const TWO_PERSON_IDS = new Set(
  POSE_PICKER_GROUPS.find(group => group.label === 'Two people')?.ids ?? []
);
const BODY_IDS = new Set(POSE_PICKER_GROUPS.find(group => group.label === 'Postures')?.ids ?? []);

/** A standing figure, offset sideways — enough joints to pass the whole-body check. */
function body(dx = 0, armUp = false): NormalizedBody {
  const points: Array<[number, number]> = [
    [0.5, 0.12],
    [0.5, 0.2],
    [0.42, 0.21],
    [0.4, armUp ? 0.12 : 0.34],
    [0.39, armUp ? 0.03 : 0.46],
    [0.58, 0.21],
    [0.6, 0.34],
    [0.61, 0.46],
    [0.46, 0.5],
    [0.46, 0.7],
    [0.46, 0.9],
    [0.54, 0.5],
    [0.54, 0.7],
    [0.54, 0.9],
    [0.49, 0.11],
    [0.51, 0.11],
    [0.47, 0.12],
    [0.53, 0.12],
  ];
  return points.map(([x, y]) => ({ x: x + dx, y }));
}

function ref(pose: string, variant: number, extra: Partial<PoseReference> = {}): PoseReference {
  return {
    id: `${pose}-${variant}`,
    pose,
    base: 'stand',
    source: 'photo',
    variant,
    aspect: 0.6,
    people: [body(0, true)],
    credit: {
      title: 'A photo',
      creator: 'Someone',
      licence: 'by',
      licenceVersion: '2.0',
      licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
      source: 'https://commons.wikimedia.org/wiki/File:A_photo.jpg',
    },
    ...extra,
  };
}

describe('pose reference data file', () => {
  it('every entry passes validation (licence, credit, whole skeleton)', () => {
    assert.ok(Array.isArray(raw.references));
    assert.equal(references.length, raw.references.length, 'an entry failed validation');
    for (const reference of references) {
      assert.ok(
        (POSE_REFERENCE_LICENCES as readonly string[]).includes(reference.credit.licence),
        reference.id
      );
      assert.ok(
        (POSE_REFERENCE_SOURCES as readonly string[]).includes(reference.source),
        reference.id
      );
      assert.ok(reference.credit.creator && reference.credit.title, reference.id);
      if (reference.source === 'cmu-mocap') {
        // The mocap database's own terms, on its own (http-only) site.
        assert.equal(reference.credit.licence, 'cmu', reference.id);
        assert.match(reference.credit.source, /^http:\/\/mocap\.cs\.cmu\.edu\//, reference.id);
        assert.match(reference.credit.licenceUrl, /^http:\/\/mocap\.cs\.cmu\.edu\//, reference.id);
      } else {
        assert.notEqual(reference.credit.licence, 'cmu', reference.id);
        assert.match(reference.credit.source, /^https:\/\//, reference.id);
        assert.match(
          reference.credit.licenceUrl,
          /^https?:\/\/creativecommons\.org\//,
          reference.id
        );
      }
      if (reference.source === 'coco') {
        assert.equal(reference.credit.licence, 'by', reference.id);
        assert.match(reference.credit.source, /^https:\/\/cocodataset\.org\//, reference.id);
      }
      for (const person of reference.people) assert.equal(person.length, 18, reference.id);
    }
  });

  it('names every source it ships from in the data file', () => {
    const sources = new Set(references.map(reference => reference.source));
    for (const source of sources) {
      assert.ok((POSE_REFERENCE_SOURCES as readonly string[]).includes(source), source);
    }
  });

  it('names known Day poses, numbered 1…N per pose, with the right headcount', () => {
    const ids = new Set<string>();
    const byPose = new Map<string, number[]>();
    for (const reference of references) {
      assert.ok(PICKER_IDS.has(reference.pose), `unknown pose ${reference.pose}`);
      assert.ok(!ids.has(reference.id), `duplicate id ${reference.id}`);
      ids.add(reference.id);
      assert.equal(reference.id, `${reference.pose}-${reference.variant}`);
      assert.equal(reference.people.length, TWO_PERSON_IDS.has(reference.pose) ? 2 : 1);
      byPose.set(reference.pose, [...(byPose.get(reference.pose) ?? []), reference.variant]);
    }
    for (const [pose, variants] of byPose) {
      assert.deepEqual(
        variants,
        variants.map((_, index) => index + 1),
        pose
      );
      assert.ok(variants.length <= 5, pose);
    }
  });

  it('is harvested for the posture the app draws each pose on', () => {
    for (const reference of references) {
      const people = reference.people.length;
      const pose = BODY_IDS.has(reference.pose)
        ? { body: reference.pose as never }
        : { layout: reference.pose as SocialLayout };
      const plan = resolveSceneGuidePlan(undefined, 0, { forcePeople: people, pose, references });
      assert.equal(reference.base, plan.intent.base, reference.id);
    }
  });

  it('stays small enough to load on demand', () => {
    assert.ok(statSync(DATA_PATH).size < 400_000);
  });
});

describe('pose reference validation', () => {
  const good = ref('wave', 1);

  it('accepts a complete entry', () => {
    assert.deepEqual(normalizePoseReference(good), good);
  });

  it('rejects NonCommercial / NoDerivatives / unknown licences', () => {
    for (const licence of ['by-nc', 'by-nd', 'by-nc-sa', 'gfdl', '']) {
      assert.equal(
        normalizePoseReference({ ...good, credit: { ...good.credit, licence } }),
        null,
        licence
      );
    }
  });

  it('rejects a missing creator, title or link', () => {
    for (const patch of [{ creator: '' }, { title: ' ' }, { source: 'not a url' }, { licenceUrl: '' }]) {
      assert.equal(normalizePoseReference({ ...good, credit: { ...good.credit, ...patch } }), null);
    }
  });

  it('reads the source, a photo unless said, and ties the CMU terms to mocap entries', () => {
    const { source: _source, ...unsaid } = good;
    assert.equal(normalizePoseReference(unsaid)?.source, 'photo');
    assert.equal(normalizePoseReference({ ...good, source: 'scan' }), null);
    const mocap = {
      ...good,
      source: 'cmu-mocap',
      credit: {
        title: 'CMU mocap subject 23 trial 03, frame 318',
        creator: 'CMU Graphics Lab Motion Capture Database',
        licence: 'cmu',
        licenceUrl: 'http://mocap.cs.cmu.edu/faqs.php',
        source: 'http://mocap.cs.cmu.edu/search.php?subjectnumber=23&motion=%25',
      },
    };
    const parsed = normalizePoseReference(mocap);
    assert.equal(parsed?.source, 'cmu-mocap');
    assert.equal(parsed?.credit.licence, 'cmu');
    assert.equal(normalizePoseReference({ ...mocap, source: 'coco' }), null, 'CMU terms on a COCO entry');
    assert.equal(
      normalizePoseReference({ ...good, source: 'cmu-mocap' }),
      null,
      'a mocap entry under a CC licence'
    );
    assert.equal(
      poseReferenceCreditLine(parsed!),
      'Mocap: CMU Graphics Lab Motion Capture Database (CMU mocap terms)'
    );
    assert.equal(poseReferenceCreditLine(good), 'Photo: Someone (CC BY 2.0)');
    assert.equal(poseReferenceCreditText(good), 'Someone (CC BY 2.0)');
    const coco = normalizePoseReference({
      ...good,
      source: 'coco',
      credit: { ...good.credit, licenceVersion: '4.0', creator: 'COCO Consortium' },
    });
    assert.equal(poseReferenceCreditLine(coco!), 'Keypoints: COCO Consortium (CC BY 4.0)');
  });

  it('rejects a skeleton that is not a whole body', () => {
    const cut = body().map((point, index) => (index === 10 || index === 13 ? null : point));
    assert.equal(normalizePoseReference({ ...good, people: [cut] }), null);
    assert.equal(normalizePoseReference({ ...good, people: [body().slice(0, 14)] }), null);
    assert.equal(normalizePoseReference({ ...good, people: [] }), null);
    assert.equal(normalizePoseReference({ ...good, variant: 0 }), null);
  });

  it('drops bad entries from a file and keeps the good ones in variant order', () => {
    const parsed = parsePoseReferences({
      references: [ref('wave', 2), { junk: true }, ref('wave', 1), ref('sit', 1)],
    });
    assert.deepEqual(
      parsed.map(entry => entry.id),
      ['sit-1', 'wave-1', 'wave-2']
    );
    assert.deepEqual(parsePoseReferences(null), []);
  });
});

describe('pose reference variants', () => {
  const list = [ref('wave', 1), ref('wave', 2), ref('wave', 3)];

  it('variant 0 is the drawing; 1…N are the references, then it cycles', () => {
    assert.equal(poseReferenceForVariant(list, 0), null);
    assert.equal(poseReferenceForVariant(list, undefined), null);
    assert.equal(poseReferenceForVariant(list, 1)?.id, 'wave-1');
    assert.equal(poseReferenceForVariant(list, 3)?.id, 'wave-3');
    assert.equal(poseReferenceForVariant(list, 4), null);
    assert.equal(poseReferenceForVariant(list, 5)?.id, 'wave-1');
    assert.equal(poseReferenceForVariant([], 3), null);
  });

  it('filters by pose, headcount and posture', () => {
    const mixed = [...list, ref('hug', 1, { people: [body(-0.2), body(0.2)] })];
    assert.equal(poseReferencesFor(mixed, 'wave', 1).length, 3);
    assert.equal(poseReferencesFor(mixed, 'wave', 2).length, 0);
    assert.equal(poseReferencesFor(mixed, 'wave', 1, 'sit').length, 0);
    assert.equal(poseReferencesFor(mixed, 'hug', 2).length, 1);
    assert.equal(poseReferencesFor(mixed, '', 1).length, 0);
  });
});

describe('pose guide with references', () => {
  const wave = [ref('wave', 1), ref('wave', 2)];
  const plan = (variant: number, refs: readonly PoseReference[] = wave, text?: string) =>
    resolveSceneGuidePlan(text, 0, {
      forcePeople: 1,
      pose: { layout: 'wave' },
      variant,
      references: refs,
    }).openPose;

  it('draws the hand-drawn figure on variant 0', () => {
    const drawn = plan(0);
    assert.equal(drawn.referenceId, undefined);
    assert.deepEqual(drawn.keypoints, plan(0, []).keypoints);
  });

  it('draws reference N on variant N, keyed as the pose', () => {
    const first = plan(1);
    assert.equal(first.referenceId, 'wave-1');
    assert.equal(first.poseKey, 'wave:1');
    assert.equal(first.libraryEntryId, undefined);
    // The reference's own shape: the raised wrist sits above the head.
    const lead = first.keypoints[0]!;
    assert.ok(lead[4]!.y < lead[0]!.y);
    assert.equal(plan(2).referenceId, 'wave-2');
    assert.equal(plan(3).referenceId, undefined);
  });

  it('falls back to the drawing when the pose has no references', () => {
    const none = plan(1, []);
    assert.equal(none.referenceId, undefined);
    const other = resolveSceneGuidePlan(undefined, 0, {
      forcePeople: 1,
      pose: { layout: 'phone' },
      variant: 1,
      references: wave,
    }).openPose;
    assert.equal(other.referenceId, undefined);
  });

  it('keeps the drawing when the beat puts the gesture on another posture', () => {
    // The Story writer's pose: a phone call, seated. The phone references stand.
    const phone = [ref('phone', 1), ref('phone', 2)];
    const seated = resolveSceneGuidePlan('on the phone on the sofa', 0, {
      forcePeople: 1,
      pose: { layout: 'phone', body: 'sit' },
      variant: 1,
      references: phone,
    });
    assert.equal(seated.intent.base, 'sit');
    assert.equal(seated.openPose.referenceId, undefined);
    const standing = resolveSceneGuidePlan('on the phone by the window', 0, {
      forcePeople: 1,
      pose: { layout: 'phone' },
      variant: 1,
      references: phone,
    });
    assert.equal(standing.openPose.referenceId, 'phone-1');
  });

  it('never stands in for a sex layout', () => {
    const intimate = resolveSceneGuidePlan('they kiss and undress on the bed', 0, {
      forcePeople: 2,
      allowIntimate: true,
      variant: 1,
      references: [ref('stand', 1), ref('lie', 1, { base: 'lie' })],
    });
    assert.equal(intimate.openPose.referenceId, undefined);
  });

  it('mirrors a two-person reference to put the lead on the picked side', () => {
    const hug = ref('hug', 1, { people: [body(-0.2), body(0.2)] });
    const lead = (leadSide: 'left' | 'right') => {
      const drawn = resolveSceneGuidePlan(undefined, 0, {
        forcePeople: 2,
        pose: { layout: 'hug' },
        variant: 1,
        leadSide,
        references: [hug],
      }).openPose;
      assert.equal(drawn.referenceId, 'hug-1');
      return bodyCentreX(drawn.keypoints[0]!)! < bodyCentreX(drawn.keypoints[1]!)!;
    };
    assert.equal(lead('left'), true);
    assert.equal(lead('right'), false);
  });

  it("walks a Day slot's Try another through the references", () => {
    const slot = { id: 'morning' as const, sceneHints: 'waves from the porch', poseLayout: 'wave' };
    const at = (poseVariant: number) => {
      const { sceneText, options } = planDaySlotPose({
        slot: { ...slot, poseVariant },
        dayMood: 'everyday',
      });
      return resolveSceneGuidePlan(sceneText, 0, { ...options, references: wave }).openPose
        .referenceId;
    };
    assert.deepEqual([0, 1, 2, 3].map(at), [undefined, 'wave-1', 'wave-2', undefined]);
  });

  it('gives a Day pose picked by name its reference on a variant', () => {
    const named = dayPoseAsPhotoPose('wave', undefined, { variant: 2, references: wave });
    assert.ok(named);
    // The pose's own words, not new ones read from the reference's joints.
    assert.equal(named.words, dayPoseWords('wave'));
    const drawn = dayPoseAsPhotoPose('wave', undefined, { references: wave });
    assert.notDeepEqual(named.people, drawn?.people);
  });
});
