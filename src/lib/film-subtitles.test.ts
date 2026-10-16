import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayWatchPlaylist } from './day-planner';
import { filmShotSubtitle } from './media-kind';
import { subtitleLines } from './video-polish';

describe('burned-in subtitles', () => {
  it('a talking clip carries its line (and the reply); else the narration', () => {
    const shots = dayWatchPlaylist(
      [{ slotId: 'morning', status: 'completed', imageUrl: '/a.png', clipStatus: 'completed', clipUrl: '/a.mp4' }],
      [{ id: 'morning', label: 'Morning', line: 'You made coffee?', replyLine: 'Only for you.' }] as never
    );
    assert.equal(shots[0]?.spoken, 'You made coffee? — Only for you.');
    assert.equal(filmShotSubtitle({ narrationText: 'The city was waking up.' }), 'The city was waking up.');
    assert.equal(filmShotSubtitle({ spoken: 'Hi', narrationText: 'later' }), 'Hi');
    assert.equal(filmShotSubtitle({}), '');
  });

  it('wraps to at most three lines, safe for drawtext', () => {
    const text = subtitleLines('He said "100% sure" \\ and then he left the room without looking back at anyone at all, not once, ever again', 24);
    const lines = text.split('\n');
    assert.ok(lines.length <= 3);
    assert.ok(lines.every(line => line.length <= 30));
    assert.doesNotMatch(text, /["%\\]/);
    assert.match(lines[2]!, /…$/);
  });
});
