// Every Director move's frames as the app makes them (moves.ts: captured, else hand-keyed), at its
// natural length and the Director's rate, for render.mts to film.
//   npx tsx scripts/director-mocap/frames.mts <out.json> [female|male] [move…]
import { writeFileSync } from 'node:fs';
import {
  DIRECTOR_MOVE_IDS,
  DIRECTOR_MOVES,
  moveFrames,
  type DirectorMoveId,
} from '../../src/lib/director/moves';
import { DIRECTOR_FPS } from '../../src/lib/director/types';

const [out, body = 'female', ...picked] = process.argv.slice(2);
if (!out) throw new Error('usage: frames.mts <out.json> [female|male] [move…]');
const kind = body === 'male' ? 'male' : 'female';
const ids = (picked.length ? picked : DIRECTOR_MOVE_IDS) as DirectorMoveId[];
const frames: Record<string, unknown> = {};
for (const id of ids) {
  frames[id] = moveFrames(id, kind, DIRECTOR_MOVES[id].seconds, DIRECTOR_FPS);
  console.log(id, DIRECTOR_MOVES[id].seconds, 's');
}
writeFileSync(out, JSON.stringify(frames));
