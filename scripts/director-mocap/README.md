# Director moves from motion capture

The Director's ready-made moves (walk, turn, sit, stand, wave, reach, look over shoulder, shrug,
bow) play real motion capture from the [CMU Graphics Lab Motion Capture Database](http://mocap.cs.cmu.edu/)
(free for all uses; credit in `docs/pose-reference-credits.md`). The nod has no clip and stays
hand-keyed. The app ships `src/lib/data/director-mocap-moves.json`; `src/lib/director/mocap.ts`
puts it on the 3D body.

- `preview.py <trial>… [--side]` — contact sheets of CMU clips (every 0.5 s, time labelled) to pick
  a window. Clips are fetched politely and cached under `~/.cache/castcut-pose-refs/cmu`.
- `harvest.py [move…]` — reads each move's window (`MOVES`: trial, seconds, mirror, stride) and
  writes the data file. Then rerun `scripts/pose-refs/build.py` (or copy its Director moves lines)
  so the credits list the clips.
- `frames.mts <out.json> [female|male] [move…]` and `render.mts <frames.json> <dir>` — every move as
  the app makes it, filmed with the Director's own stage in headless Chromium (AVI per move), to
  check a pick by eye.
