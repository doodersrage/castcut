/**
 * Ask the server to probe the cut's shots (film-delivery-check-server.ts) and turn the answers
 * into reasons per shot. Best effort: null when the check couldn't run (the cut goes ahead).
 */

import { shotDeliveryReasons, type ShotProbe } from './film-delivery-check';
import type { FilmPlaylistShot } from './media-kind';

const CHECK_TIMEOUT_MS = 45_000;

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
  try {
    const response = await fetch('/api/film/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      body: JSON.stringify({
        shots: shots.map(shot => ({
          key: shot.key,
          url: shot.url,
          kind: shot.kind,
          entryId: shot.entryId,
          expectSpeech: shot.kind === 'clip' && expectSpeech(shot),
        })),
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
    return { reasons, mediaChecked: json.ffmpeg === true };
  } catch {
    return null;
  }
}
