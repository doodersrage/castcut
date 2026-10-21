/**
 * Lists the one-person pose references with their posture class and the words Castcut makes from
 * the skeleton alone (describePhotoPose) — for picking the bench's targets.
 *
 *   node --import tsx scripts/pose-bench/list-refs.mts
 */
import { readFileSync } from 'node:fs';
import { describePhotoPose } from '../../src/lib/pose/describe';
import { classifyPosture } from '../../src/lib/pose/posture';

type Ref = {
  id: string;
  source: string;
  aspect: number;
  people: Array<Array<{ x: number; y: number } | null>>;
  credit?: { source?: string; licence?: string };
};
const refs = (
  JSON.parse(readFileSync('public/pose-references.json', 'utf8')) as { references: Ref[] }
).references;
for (const ref of refs) {
  if (ref.people.length !== 1) continue;
  const words = describePhotoPose({ aspect: ref.aspect, people: ref.people });
  const posture = classifyPosture(ref.people[0]!, ref.aspect);
  const joints = ref.people[0]!.filter(Boolean).length;
  console.log(
    [
      ref.id,
      ref.source,
      joints,
      `${posture.posture}${posture.confident ? '' : '?'}`,
      ref.credit?.licence ?? '',
      words,
    ].join(' | ')
  );
}
