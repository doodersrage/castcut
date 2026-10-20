import type { EngineHealthState } from '../engine/health-engines';

/**
 * The engines for an outfit's runway clip (Outfit's Turn around, Cast home → Wardrobe), best
 * first: MiniMax-H3 turns with the cleanest face and fabric, then WAN, then LTX-2.5 (the fastest,
 * and the softest turn). The user picked this order (2026-10-14): slower, much better.
 */
export const RUNWAY_CLIP_ENGINES = [
  { model: 'minimax-h3', label: 'MiniMax-H3', wait: 'a few minutes' },
  { model: 'wan-video-rapid-aio', label: 'WAN', wait: 'a couple of minutes' },
  { model: 'ltx-video-2.5', label: 'LTX-2.5', wait: 'about a minute' },
] as const;

export type RunwayClipEngine = (typeof RUNWAY_CLIP_ENGINES)[number];

/**
 * The first engine ComfyUI is ready for. When none reads ready, the first that could not be
 * checked (ComfyUI unreachable, a check that failed) is tried; when all are missing, LTX-2.5.
 */
export function pickRunwayClipEngine(
  stateOf: (model: string) => EngineHealthState | undefined
): RunwayClipEngine {
  const states = RUNWAY_CLIP_ENGINES.map(engine => stateOf(engine.model) ?? 'unknown');
  const ready = states.indexOf('ready');
  if (ready >= 0) return RUNWAY_CLIP_ENGINES[ready]!;
  const unknown = states.indexOf('unknown');
  return RUNWAY_CLIP_ENGINES[unknown >= 0 ? unknown : RUNWAY_CLIP_ENGINES.length - 1]!;
}
