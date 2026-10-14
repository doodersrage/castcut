/**
 * Ask the server to probe the cut's shots (film-delivery-check-server.ts) and turn the answers
 * into reasons per shot. Best effort: null when the check couldn't run (the cut goes ahead).
 */

import { duplicateShots, shotDeliveryReasons, type ShotProbe } from './film-delivery-check';
import { sharedLlmRequestBody } from './llm-request-options';
import { loadSettingsCache } from './settings-cache';
import type { FilmPlaylistShot } from './media-kind';

const CHECK_TIMEOUT_MS = 45_000;
/** With the writing check: one vision read per shot (a few seconds each). */
const TEXT_CHECK_TIMEOUT_MS = 180_000;
/** The writing check runs on cuts up to this many shots (longer cuts skip it). */
const TEXT_CHECK_MAX_SHOTS = 16;

export type DeliveryCheckResult = {
  /** Reasons per shot key (only shots with something to say). */
  reasons: Map<string, string[]>;
  /** Black frames and sound were measured (ffmpeg on the server). */
  mediaChecked: boolean;
};

export async function checkCutDelivery(
  shots: Array<FilmPlaylistShot & { key: string }>,
  expectSpeech: (shot: FilmPlaylistShot & { key: string }) => boolean
): Promise<DeliveryCheckResult | null> {
  if (shots.length === 0 || typeof fetch === 'undefined') return null;
  const readText = shots.length <= TEXT_CHECK_MAX_SHOTS;
  try {
    const response = await fetch('/api/film/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      signal: AbortSignal.timeout(readText ? TEXT_CHECK_TIMEOUT_MS : CHECK_TIMEOUT_MS),
      body: JSON.stringify({
        shots: shots.map(shot => ({
          key: shot.key,
          url: shot.url,
          kind: shot.kind,
          entryId: shot.entryId,
          expectSpeech: shot.kind === 'clip' && expectSpeech(shot),
          ...(readText ? { readText: true } : {}),
        })),
        ...sharedLlmRequestBody(loadSettingsCache().shared),
      }),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { ffmpeg?: boolean; results?: ShotProbe[] };
    const byKey = new Map((json.results ?? []).filter(Boolean).map(probe => [probe.key, probe]));
    const reasons = new Map<string, string[]>();
    for (const shot of shots) {
      const found = shotDeliveryReasons(byKey.get(shot.key), shot.kind, {
        expectSpeech: expectSpeech(shot),
      });
      if (found.length > 0) reasons.set(shot.key, found);
    }
    // The same picture twice: a re-roll that came back the same, or one still used twice.
    const twins = duplicateShots(
      shots.map((shot, index) => ({
        key: shot.key,
        title: shot.title || `shot ${index + 1}`,
        dhash: byKey.get(shot.key)?.dhash,
      }))
    );
    for (const [key, earlier] of twins) {
      reasons.set(key, [...(reasons.get(key) ?? []), `looks the same as ${earlier}`]);
    }
    return { reasons, mediaChecked: json.ffmpeg === true };
  } catch {
    return null;
  }
}
