import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayPoseAsPhotoPose } from './day-pose-presets';
import { fitPhotoPoseToHeadcount } from './photo-pose-fit';

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

  it('says so plainly when nobody is in the photo', () => {
    assert.throws(() => fitPhotoPoseToHeadcount(read(), 1), /No person found in that photo/);
  });
});
