/**
 * The harvester's window into the app (run with `node --import tsx`): one JSON request per stdin
 * line, one JSON reply per stdout line. The Python harvester keeps one bridge running, so every
 * check uses the app's own code — the pose list, hand-drawn figures and pose words (day-pose-guide
 * / day-pose-presets / day-pose-packs), the headcount (pose-score `countProminentPeople`), the
 * pose check's limb-angle match (pose-limb-score `scoreLimbAngles`) and posture classes
 * (`posture-classifier.mts`, swappable with POSE_REFS_CLASSIFIER).
 *
 * Requests:
 *   {"cmd":"poses"}                                            → every Day pose to harvest
 *   {"cmd":"classify","people":[body…],"width":w,"height":h}   → posture read of each body
 *   {"cmd":"agree","a":group,"b":group}                        → the two groups count as one
 *   {"cmd":"limbs","guide":body,"detected":body,"aspects":{guide,detected}}
 *                                                              → {score, gestureMiss, off} | null
 *   {"cmd":"prominent","people":[body…],"width":w,"height":h} → people clearly in the picture
 *   {"cmd":"project","skeletons":[{joints,headTop,headBase}…],"view":{azimuthDeg,elevationDeg}}
 *                                                              → {people, confidence, aspect} | null
 *                                                                 (pose-reference-sources: a 3D
 *                                                                 mocap skeleton through a camera)
 *   {"cmd":"coco","keypoints":[x,y,v × 17],"frame":{x,y,width,height}}
 *                                                              → {body, confidence} | null
 *   {"cmd":"describe","body":body,"aspect":a}                  → the pose in words (pose-describe)
 *   {"cmd":"merge","reads":[{joints,crop,onOther}…]}          → the people, image pixels (pose-reference-duo:
 *                                                                 per-person DWPose reads merged)
 *   {"cmd":"relation","pose":id,"people":[body,body],"aspect":a}
 *                                                              → {ok, why}: the pair's contact rule
 *   {"cmd":"batch","requests":[request…]}                      → [{ok, result | error}…]
 */

import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { resolveSceneGuidePlan, type SocialLayout } from '@/lib/day-pose-guide';
import { dayPoseWords } from '@/lib/day-pose-presets';
import { BUILT_IN_POSE_PACKS } from '@/lib/day-pose-packs';
import { POSE_PICKER_GROUPS, poseLayoutLabel } from '@/lib/pose-layout-labels';
import { describePoseFigure } from '@/lib/pose-describe';
import { scoreLimbAngles } from '@/lib/pose-limb-score';
import {
  cocoKeypointsToBody,
  projectSkeletons,
  type CameraView,
  type Skeleton3D,
} from '@/lib/pose-reference-sources';
import { duoRelation, mergePersonReads, type PersonRead } from '@/lib/pose-reference-duo';
import { countProminentPeople } from '@/lib/pose-score';
import type { NormalizedBody } from '@/lib/pose-library';

type PostureRead = { posture: string; group: string; confident: boolean };
type Classifier = {
  classifyPosture: (input: {
    people: NormalizedBody[];
    width: number;
    height: number;
  }) => PostureRead;
  groupsAgree?: (a: string, b: string) => boolean;
};

const classifierPath = resolve(
  process.env.POSE_REFS_CLASSIFIER || new URL('./posture-classifier.mts', import.meta.url).pathname
);
const classifier = (await import(pathToFileURL(classifierPath).href)) as Classifier;

const BODY_IDS = new Set(POSE_PICKER_GROUPS.find(group => group.label === 'Postures')?.ids ?? []);

function handDrawn(id: string, people: number) {
  const pose = BODY_IDS.has(id) ? { body: id as never } : { layout: id as SocialLayout };
  const plan = resolveSceneGuidePlan(undefined, 0, { forcePeople: people, pose, openPose: true });
  const { width, height } = plan.openPose.canvas;
  return {
    aspect: width / height,
    width,
    height,
    base: plan.intent.base,
    social: plan.intent.social,
    bodies: plan.openPose.keypoints,
  };
}

function poses() {
  const packs = new Map<string, string[]>();
  for (const pack of BUILT_IN_POSE_PACKS) {
    for (const entry of pack.entries) {
      if (!entry.layout) continue;
      packs.set(entry.layout, [...new Set([...(packs.get(entry.layout) ?? []), pack.id])]);
    }
  }
  return POSE_PICKER_GROUPS.flatMap(group =>
    group.ids.map(id => {
      const people = group.label === 'Two people' ? 2 : 1;
      const drawn = handDrawn(id, people);
      return {
        id,
        group: group.label,
        label: poseLayoutLabel(id),
        // The words the app already uses for this pose — the vision check asks about them too.
        words: dayPoseWords(id),
        people,
        aspect: drawn.aspect,
        base: drawn.base,
        social: drawn.social,
        bodies: drawn.bodies,
        postures: drawn.bodies.map(body =>
          classifier.classifyPosture({ people: [body], width: drawn.width, height: drawn.height })
        ),
        packs: packs.get(id) ?? [],
      };
    })
  );
}

function handle(request: Record<string, unknown>): unknown {
  switch (request.cmd) {
    case 'poses':
      return poses();
    case 'classify': {
      const people = request.people as NormalizedBody[];
      const width = Number(request.width) || 1;
      const height = Number(request.height) || 1;
      return people.map(body => classifier.classifyPosture({ people: [body], width, height }));
    }
    case 'agree': {
      const a = String(request.a);
      const b = String(request.b);
      return classifier.groupsAgree ? classifier.groupsAgree(a, b) : a === b;
    }
    case 'limbs': {
      const match = scoreLimbAngles(
        request.guide as NormalizedBody,
        request.detected as NormalizedBody,
        request.aspects as { guide: number; detected: number }
      );
      return match
        ? { score: match.score, gestureMiss: match.gestureMiss, off: match.definingOff }
        : null;
    }
    case 'prominent':
      return countProminentPeople({
        canvas: { width: Number(request.width) || 1, height: Number(request.height) || 1 },
        people: request.people as NormalizedBody[],
      });
    case 'project':
      return projectSkeletons(request.skeletons as Skeleton3D[], request.view as CameraView);
    case 'coco':
      return cocoKeypointsToBody(
        request.keypoints as number[],
        request.frame as { x: number; y: number; width: number; height: number }
      );
    case 'describe':
      return describePoseFigure(request.body as NormalizedBody, {
        aspect: Number(request.aspect) || undefined,
      }).text;
    case 'merge':
      return mergePersonReads(request.reads as PersonRead[]);
    case 'relation':
      return duoRelation(
        String(request.pose),
        request.people as NormalizedBody[],
        Number(request.aspect) || 1
      );
    case 'batch':
      return (request.requests as Array<Record<string, unknown>>).map(inner => {
        try {
          return { ok: true, result: handle(inner) };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      });
    default:
      throw new Error(`unknown cmd ${String(request.cmd)}`);
  }
}

const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  if (!line.trim()) continue;
  let reply: unknown;
  try {
    reply = { ok: true, result: handle(JSON.parse(line) as Record<string, unknown>) };
  } catch (error) {
    reply = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  process.stdout.write(`${JSON.stringify(reply)}\n`);
}
