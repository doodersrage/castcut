/**
 * The harvester's posture classifier — a hook, so a better read can replace it.
 *
 * Contract: `classifyPosture({ people, width, height })` reads the FIRST body in `people`
 * (COCO-18, 0–1 of a width × height picture) and returns `{ posture, group, confident }`. The
 * harvester reads the app's hand-drawn figure for the pose with the same function and keeps a
 * photo only when both land in agreeing groups (`groupsAgree`), so any classifier works as long
 * as it is consistent with itself.
 *
 * Today: the pose check's posture classes (src/lib/pose-posture.ts). To try another, write a
 * module with the same exports and run the harvester with POSE_REFS_CLASSIFIER=path/to/it.mts.
 */

import {
  classifyPosture as readPosture,
  postureGroupsAgree,
  type PostureGroup,
} from '@/lib/pose-posture';
import type { NormalizedBody } from '@/lib/pose-library';

export function classifyPosture(input: {
  people: NormalizedBody[];
  width: number;
  height: number;
}): { posture: string; group: string; confident: boolean } {
  const body = input.people[0];
  if (!body) return { posture: 'unknown', group: 'unknown', confident: false };
  const read = readPosture(body, input.width / Math.max(1, input.height));
  return { posture: read.posture, group: read.group, confident: read.confident };
}

export function groupsAgree(a: string, b: string): boolean {
  return postureGroupsAgree(a as PostureGroup, b as PostureGroup);
}
