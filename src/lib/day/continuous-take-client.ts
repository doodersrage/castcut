'use client';

/**
 * A continuous take's start, on the page (continuous-take.ts): when the shot is marked and the
 * shot before has its clip, that clip's sharpest last frame (POST /api/clip/frame, sharpest) —
 * what Animate starts the clip on. Undefined when it starts from its own still (not marked, the
 * first shot, no clip before it yet, re-anchored, or the frame couldn't be read: said, and the
 * still is used).
 */
import { chainPlanFor } from './continuous-take';
import type { SavedScene } from './scenes';

export type ChainStart = { frameUrl: string; sceneId: string; clipUrl: string; atSec: number };

export async function chainStartFor(
  scene: SavedScene | undefined,
  scenes: readonly SavedScene[],
  onNote?: (note: string) => void
): Promise<ChainStart | undefined> {
  if (!scene) return undefined;
  const plan = chainPlanFor(scene, scenes);
  if (!plan.chain) {
    if (plan.why === 'no-parent-clip') {
      onNote?.(`${scene.name}: the shot before has no clip yet — this one starts from its still.`);
    } else if (plan.why === 're-anchor') {
      onNote?.(`${scene.name}: a long chain starts again from its own still here.`);
    }
    return undefined;
  }
  try {
    const response = await fetch('/api/clip/frame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ clipUrl: plan.parentClipUrl, sharpest: true }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      url?: string;
      atSec?: number;
      error?: string;
    };
    if (!response.ok || !data.url || typeof data.atSec !== 'number') {
      onNote?.(
        `${scene.name}: ${data.error || 'the shot before’s last frame couldn’t be read'} — it starts from its still.`
      );
      return undefined;
    }
    return {
      frameUrl: data.url,
      sceneId: plan.parent.id,
      clipUrl: plan.parentClipUrl,
      atSec: data.atSec,
    };
  } catch {
    onNote?.(
      `${scene.name}: the shot before’s last frame couldn’t be read — it starts from its still.`
    );
    return undefined;
  }
}
