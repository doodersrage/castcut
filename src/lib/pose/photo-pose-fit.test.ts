import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayPoseAsPhotoPose } from '../day/pose-presets';
import { fitPhotoPoseToHeadcount, framePhotoPeople } from './photo-pose-fit';
import { placeLibraryPeople } from './library';

const stand = dayPoseAsPhotoPose('stand')!.people[0]!;
const walk = dayPoseAsPhotoPose('walk')!.people[0]!;
const sit = dayPoseAsPhotoPose('sit')!.people[0]!;

function read(...people: (typeof stand)[]) {
  return { aspect: 0.75, people };
}

describe('fitPhotoPoseToHeadcount', () => {
  it('a one-person still takes the largest (first) person', () => {
    const solo = fitPhotoPoseToHeadcount(read(stand), 1);
    assert.deepEqual(solo.pose.people, [stand]);
    assert.equal(solo.pose.source, 'photo');
    assert.equal(solo.pose.aspect, 0.75);
    assert.equal(solo.note, 'Using the pose from your photo.');

    const crowd = fitPhotoPoseToHeadcount(read(stand, walk, sit), 1);
    assert.deepEqual(crowd.pose.people, [stand]);
    assert.match(crowd.note, /Found 3 people .* the largest one/);
  });

  it('a two-person still needs two people and keeps the two largest', () => {
    const duo = fitPhotoPoseToHeadcount(read(stand, walk), 2);
    assert.deepEqual(duo.pose.people, [stand, walk]);
    assert.equal(duo.note, 'Using both people from your photo.');
    assert.deepEqual(fitPhotoPoseToHeadcount(read(stand, walk, sit), 2).pose.people, [stand, walk]);
    assert.throws(
      () => fitPhotoPoseToHeadcount(read(stand), 2),
      /Only one person found in that photo, and this still is two people/
    );
  });

  it('with no headcount the photo decides (one or two people)', () => {
    const fit = fitPhotoPoseToHeadcount(read(stand, walk), undefined);
    assert.equal(fit.pose.people.length, 2);
    assert.equal(fit.note, 'Using your photo (2 people).');
    assert.equal(fitPhotoPoseToHeadcount(read(sit)).note, 'Using your photo (1 person).');
    const group = fitPhotoPoseToHeadcount(read(stand, walk, sit));
    assert.deepEqual(group.pose.people, [stand, walk]);
    assert.equal(group.note, 'Found 3 people — using the two largest.');
  });

  it("keeps the vision posture read (the lead's) when the photo had more people", () => {
    // Pose bench (2026-10-21): a lunge and a hurdle with bystanders lost it.
    const posture = { posture: 'kneeling' as const, support: 'the track' };
    const crowd = { ...read(stand, walk, sit), posture };
    assert.deepEqual(fitPhotoPoseToHeadcount(crowd, 1).pose.posture, posture);
    assert.deepEqual(fitPhotoPoseToHeadcount(crowd, 2).pose.posture, posture);
    assert.deepEqual(fitPhotoPoseToHeadcount(crowd).pose.posture, posture);
    assert.equal(fitPhotoPoseToHeadcount(read(stand, walk), 1).pose.posture, undefined);
  });

  it('says so plainly when nobody is in the photo', () => {
    assert.throws(() => fitPhotoPoseToHeadcount(read(), 1), /No person found in that photo/);
  });
});

describe('framePhotoPeople: a photo pose fills the guide like a reference', () => {
  const span = (people: { body: ({ x: number; y: number } | null)[] }[]) => {
    const pts = people.flatMap(person => person.body.filter(Boolean)) as { x: number; y: number }[];
    const ys = pts.map(p => p.y);
    const xs = pts.map(p => p.x);
    return {
      height: Math.max(...ys) - Math.min(...ys),
      centreX: (Math.max(...xs) + Math.min(...xs)) / 2,
    };
  };
  // The standing figure shrunk to a third of a landscape photo's height, near its left edge.
  const small = (body: typeof stand, scale: number, dx: number, dy: number) =>
    body.map(p => (p ? { x: p.x * scale + dx, y: p.y * scale + dy } : null));

  it('a small, off-centre person is cropped to fill the 576×768 guide, centred', () => {
    const photo = { aspect: 1.5, people: [small(stand, 0.33, 0.02, 0.5)], source: 'photo' as const };
    const letterboxed = span(
      placeLibraryPeople({ id: 'p', key: 'photo:1', score: 1, createdAt: 0, ...photo }, 576, 768)
    );
    assert.ok(letterboxed.height < 0.3 * 768, `before: ${letterboxed.height}`);
    const framed = framePhotoPeople(photo);
    const placed = span(
      placeLibraryPeople({ id: 'p', key: 'photo:1', score: 1, createdAt: 0, ...framed }, 576, 768)
    );
    assert.ok(placed.height > 0.75 * 768 && placed.height < 0.9 * 768, `after: ${placed.height}`);
    assert.ok(Math.abs(placed.centreX - 288) < 0.05 * 576, `centre: ${placed.centreX}`);
  });

  it('keeps the photo proportions (no stretch) and the pair as they stood', () => {
    const photo = { aspect: 1.5, people: [small(stand, 0.4, 0.1, 0.3), small(walk, 0.4, 0.5, 0.3)] };
    const framed = framePhotoPeople(photo);
    // Shoulder width over neck-to-hip height, in pixels: the body's own shape, unchanged.
    const shape = (body: typeof stand, aspect: number) =>
      (Math.abs(body[5]!.x - body[2]!.x) * aspect) / Math.abs(body[8]!.y - body[1]!.y);
    assert.ok(Math.abs(shape(photo.people[0]!, 1.5) - shape(framed.people[0]!, framed.aspect)) < 0.01);
    assert.ok(framed.people[0]![1]!.x < framed.people[1]![1]!.x, 'the lead stays on the left');
  });

  it('a body cut off by the photo keeps that edge; a full frame is left as it is', () => {
    const noFeet = stand.map((p, index) => (index === 10 || index === 13 ? null : p));
    const cut = framePhotoPeople({ aspect: 0.75, people: [small(noFeet, 0.9, 0.05, 0.3)] });
    const lowest = Math.max(...cut.people[0]!.filter(Boolean).map(p => p!.y));
    assert.ok(lowest < 1 && lowest > 0.5);
    const once = framePhotoPeople({ aspect: 1.5, people: [small(stand, 0.33, 0.02, 0.5)] });
    assert.equal(framePhotoPeople(once), once);
  });
});
