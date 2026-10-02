import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  storyBeatAwaitsRewrite,
  storyBeatRewriteRevertPatch,
  storyBeatRewriteStartPatch,
  storyBeatScene,
  storyBeatTextLocked,
  storyBeforeBeat,
} from '../hooks/roleplay/story-beat-edit';
import {
  confirmRoleplayRestart,
  editRoleplayStoryBeatPatch,
  normalizeRoleplaySceneText,
  patchRoleplayStoryBeat,
  roleplayRestartNotice,
  roleplayStillQueueResultPatch,
  roleplayStillTakes,
  type RoleplayStoryBeat,
} from './roleplay';
import { normalizeRoleplayLibrarySnapshot } from './roleplay-library';
import { roleplayBioRequestForLead } from './roleplay-play-core';

const beat = (extra: Partial<RoleplayStoryBeat> = {}): RoleplayStoryBeat => ({
  id: 'b1',
  at: 100,
  title: 'The letter',
  blurb: 'A letter under the door.',
  prompt: 'Story still: a letter under the door',
  stillBrief: 'green raincoat, hallway, morning light',
  promptId: 'p1',
  imageUrl: '/view/one.png',
  stillStatus: 'completed',
  ...extra,
});

describe('editing a scene in the reel', () => {
  it('tidies typed text and refuses a blurb too short to be a scene', () => {
    assert.deepEqual(normalizeRoleplaySceneText({ title: '  The   note ', blurb: ' She  reads it. ' }), {
      title: 'The note',
      blurb: 'She reads it.',
    });
    assert.equal(normalizeRoleplaySceneText({ title: 'The note', blurb: 'no' }), null);
    // An emptied title falls back to the scene's own.
    assert.equal(
      normalizeRoleplaySceneText({ title: ' ', blurb: 'She reads it.' }, 'The letter')?.title,
      'The letter'
    );
    assert.equal(normalizeRoleplaySceneText({ title: '', blurb: 'She reads it.' }), null);
    assert.equal(
      normalizeRoleplaySceneText({ title: 'T', blurb: 'x'.repeat(900) })?.blurb.length,
      400
    );
  });

  it('is no edit when nothing changed', () => {
    assert.equal(
      editRoleplayStoryBeatPatch(beat(), { title: 'The letter', blurb: ' A letter under  the door. ' }),
      null
    );
  });

  it('clears the still prompt and brief, keeps the still, and re-reads the pose', () => {
    const before = beat({ pose: { body: 'kneel' }, poseLayout: 'wave' });
    const patch = editRoleplayStoryBeatPatch(before, {
      title: 'The letter',
      blurb: 'She sits on the stairs and reads the letter.',
    });
    assert.ok(patch);
    const [after] = patchRoleplayStoryBeat([before], before, patch);
    assert.equal(after?.blurb, 'She sits on the stairs and reads the letter.');
    assert.equal(after?.prompt, undefined);
    assert.equal(after?.stillBrief, undefined);
    assert.equal(after?.textEdited, true);
    // The writer's pose described the old words; the player's own pick stays.
    assert.equal(after?.pose, undefined);
    assert.equal(after?.poseLayout, 'wave');
    assert.equal(after?.imageUrl, '/view/one.png');
    assert.equal(after?.stillStatus, 'completed');
    assert.equal(storyBeatAwaitsRewrite(after!), true);
  });

  it("keeps the writer's pose when only the title changed", () => {
    const before = beat({ pose: { body: 'kneel' } });
    const patch = editRoleplayStoryBeatPatch(before, { title: 'The note', blurb: before.blurb });
    assert.ok(patch);
    assert.equal('pose' in patch, false);
    assert.equal(patch.prompt, undefined);
    assert.equal(patch.title, 'The note');
  });

  it('locks the text while the still is written, queued or rendered', () => {
    assert.equal(storyBeatTextLocked(beat()), false);
    assert.equal(storyBeatTextLocked(beat({ stillStatus: 'writing' })), true);
    assert.equal(storyBeatTextLocked(beat({ stillStatus: 'queued' })), true);
    assert.equal(storyBeatTextLocked(beat({ stillStatus: 'running' })), true);
    assert.equal(storyBeatTextLocked(beat({ clipStatus: 'writing' })), true);
    assert.equal(storyBeatTextLocked(beat({ stillStatus: 'error' })), false);
    // A retry in flight behind a shown earlier take.
    assert.equal(
      storyBeatTextLocked(
        beat({
          stillTakes: [
            { promptId: 'p1', imageUrl: '/view/one.png', stillStatus: 'completed' },
            { promptId: 'p2', stillStatus: 'queued' },
          ],
          stillTakeIndex: 0,
        })
      ),
      true
    );
  });

  it('writes it again as a new take: the earlier still stays', () => {
    const edited = { ...beat(), prompt: undefined, textEdited: true };
    const start = storyBeatRewriteStartPatch(edited);
    const writing = { ...edited, ...start };
    assert.equal(writing.stillStatus, 'writing');
    assert.equal(writing.imageUrl, undefined);
    assert.equal(storyBeatTextLocked(writing), true);
    // What commitStill records once the job is queued.
    const queued = { ...writing, ...roleplayStillQueueResultPatch(writing, 'p2') };
    const takes = roleplayStillTakes(queued);
    assert.equal(takes.length, 2);
    assert.equal(takes[0]?.imageUrl, '/view/one.png');
    assert.equal(takes[0]?.stillStatus, 'completed');
    assert.equal(takes[1]?.promptId, 'p2');
    assert.equal(queued.stillTakeIndex, 1);
  });

  it('puts the earlier still back when the write fails before a job is sent', () => {
    const edited = { ...beat(), prompt: undefined, textEdited: true };
    const writing = { ...edited, ...storyBeatRewriteStartPatch(edited) };
    const reverted = { ...writing, ...storyBeatRewriteRevertPatch(edited) };
    assert.equal(reverted.imageUrl, '/view/one.png');
    assert.equal(reverted.stillStatus, 'completed');
    assert.equal(reverted.promptId, 'p1');
    assert.equal(roleplayStillTakes(reverted).length, 1);
    assert.equal(storyBeatAwaitsRewrite(reverted), true);
  });

  it('asks the writer with the story that led to the scene, and the scene as a card', () => {
    const story = [beat(), beat({ id: 'b2', at: 200, title: 'The station' }), beat({ id: 'b3', at: 300 })];
    assert.deepEqual(
      storyBeforeBeat(story, story[1]!).map(entry => entry.id),
      ['b1']
    );
    assert.deepEqual(storyBeforeBeat(story, story[0]!), []);
    assert.deepEqual(storyBeatScene(beat({ kind: 'ending' })), {
      id: 'b1',
      title: 'The letter',
      blurb: 'A letter under the door.',
      kind: 'ending',
    });
  });

  it('survives a saved story, and older saved stories load without it', () => {
    const snapshot = normalizeRoleplayLibrarySnapshot({
      story: [
        { ...beat(), prompt: undefined, textEdited: true },
        { ...beat({ id: 'b2', at: 200 }), textEdited: 'yes' },
        beat({ id: 'b3', at: 300 }),
      ],
    });
    assert.equal(snapshot?.story?.[0]?.textEdited, true);
    assert.equal(snapshot?.story?.[0]?.prompt, undefined);
    assert.equal(snapshot?.story?.[0]?.imageUrl, '/view/one.png');
    assert.equal('textEdited' in (snapshot?.story?.[1] ?? {}), false);
    assert.equal('textEdited' in (snapshot?.story?.[2] ?? {}), false);
    assert.equal(storyBeatAwaitsRewrite(snapshot!.story![2]!), false);
  });
});

describe('starting the story over', () => {
  it('says what goes and what stays', () => {
    assert.equal(
      roleplayRestartNotice(1),
      'This clears 1 scene from the reel. Stills and clips stay in the Gallery.'
    );
    assert.match(roleplayRestartNotice(3), /3 scenes .* Stills and clips stay in the Gallery\.$/);
    // Nothing to lose (and no window in a test): no question asked.
    assert.equal(confirmRoleplayRestart(0), true);
  });

  it('a new bible for the same Cast lead keeps the name', () => {
    const body = { action: 'bio', characterName: undefined, avoidCharacterNames: ['Story Mid'] };
    assert.deepEqual(roleplayBioRequestForLead(body, ' Story Mid '), {
      action: 'bio',
      characterName: 'Story Mid',
      avoidCharacterNames: [],
    });
    // No lead name: the request is the first-write request, unchanged.
    assert.equal(roleplayBioRequestForLead(body, ''), body);
    // A name locked on the Character name field wins.
    const locked = { action: 'bio', characterName: 'Ivy Finch' };
    assert.equal(roleplayBioRequestForLead(locked, 'Story Mid'), locked);
  });
});
