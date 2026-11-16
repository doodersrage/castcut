import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { synthesizeSceneStickFigures, turnTowardEachOther } from './pose-guide';
import { poseLookLine } from '../pose/coaching';
import { talkingClipPrompt } from '../video/ltx25-renderer';

// The flagship (2026-11-16): "can we have them talking to each other instead of just the camera?"
describe('two people in a scene talk to each other, not to the lens', () => {
  it('the pose map turns both faces and bodies toward each other', () => {
    const { figures } = synthesizeSceneStickFigures('Slyne and Jason, the two of them together.', 0, {
      people: 2,
    } as never);
    assert.equal(figures.length, 2);
    const [a, b] = turnTowardEachOther(figures);
    const leftOne = a!.pelvis.x < b!.pelvis.x ? a! : b!;
    const rightOne = leftOne === a ? b! : a!;
    assert.equal(leftOne.gaze, 'right');
    assert.equal(rightOne.gaze, 'left');
    const span = (f: typeof a) => Math.abs(f!.rShoulder.x - f!.lShoulder.x);
    assert.ok(span(a) < span(figures[0]!), 'the body turns a little their way');
  });

  it('a hug keeps its bodies; the faces still turn', () => {
    const close = synthesizeSceneStickFigures('Slyne and Jason, the two of them together.', 0, {
      people: 2,
    } as never).figures.map((f, i) => ({ ...f, pelvis: { ...f.pelvis, x: 0.5 + i * 0.1 } }));
    const turned = turnTowardEachOther(close);
    assert.deepEqual(turned[0]!.lShoulder, close[0]!.lShoulder);
    assert.equal(turned[0]!.gaze, 'right');
  });

  it('the still prompt says so for two; one alone looks away', () => {
    assert.match(poseLookLine('partner', 2), /turned toward each other mid-conversation/);
    assert.match(poseLookLine('partner', 1), /looking off to the side/);
  });

  it('a talking clip says the line to the listener, not into the lens', () => {
    const close = talkingClipPrompt({
      line: 'Where would my books go?',
      framing: 'close',
      listener: { noun: 'the person they are talking to', inFrame: false },
    });
    assert.match(close, /looks at the person they are talking to, just off camera/);
    assert.doesNotMatch(close, /looks into the camera|keeps looking at the camera/);
    const wide = talkingClipPrompt({
      line: "I'll build a shelf.",
      speaker: 'He',
      framing: 'wide',
      listener: { noun: 'the woman beside him', inFrame: true },
    });
    assert.match(wide, /says it to the woman beside him, looking at them, not into the lens/);
    const alone = talkingClipPrompt({ line: 'Hi.', framing: 'close' });
    assert.match(alone, /looks into the camera/);
  });
});

// "Very stiff with just the head or mouth moving" (the flagship, 2026-11-16).
describe('a talking clip on MiniMax-H3 moves the way people talk', () => {
  it('lively: hands, head, shoulders and weight; LTX keeps its held-still hold', () => {
    for (const framing of ['close', 'wide'] as const) {
      const lively = talkingClipPrompt({ line: 'Found one.', framing, lively: true });
      assert.match(lively, /hands gesture with the words/);
      assert.doesNotMatch(lively, /only small natural head and hand movements|body stays still/);
      assert.match(lively, /does not walk away/);
      assert.match(talkingClipPrompt({ line: 'Found one.', framing }), /only small natural head and hand movements/);
    }
  });
});
