/**
 * Cut's live audio meters: the monitor's sound (clips, lines, narration, music, ambience,
 * effects) through one Web Audio bus, a left and a right analyser on it. Loudness was only
 * checked after a render; this shows peaks and clipping while you edit.
 *
 * Safe by construction: an element is only routed through the bus once the bus is running (it is
 * resumed by the Play click), and only when the browser lets the page read it (same origin, or
 * fetched with CORS) — a cross-origin element routed through Web Audio would play silence.
 * Client only; the maths at the bottom is pure.
 */

type Bus = {
  context: AudioContext;
  input: GainNode;
  left: AnalyserNode;
  right: AnalyserNode;
};

let bus: Bus | null = null;
const tapped = new WeakSet<HTMLMediaElement>();
// Played before the bus was running (the Play click resumes it a moment later): tapped then.
const waiting = new Set<HTMLMediaElement>();

function ensureBus(): Bus | null {
  if (bus) return bus;
  if (typeof window === 'undefined') return null;
  const Context =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  const context = new Context();
  const input = context.createGain();
  const splitter = context.createChannelSplitter(2);
  const left = context.createAnalyser();
  const right = context.createAnalyser();
  for (const analyser of [left, right]) {
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;
  }
  input.connect(context.destination);
  input.connect(splitter);
  splitter.connect(left, 0);
  splitter.connect(right, 1);
  bus = { context, input, left, right };
  context.addEventListener('statechange', () => {
    if (context.state !== 'running') return;
    for (const element of waiting) tapCutMeter(element);
    waiting.clear();
  });
  return bus;
}

/** Start the bus (call from a click — browsers keep audio suspended until a gesture). */
export function resumeCutMeter(): void {
  const current = ensureBus();
  if (current && current.context.state !== 'running') {
    void current.context.resume().catch(() => undefined);
  }
}

function readable(element: HTMLMediaElement): boolean {
  if (element.crossOrigin) return true;
  try {
    const src = element.currentSrc || element.src;
    return Boolean(src) && new URL(src, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

/** Route an element through the meter bus (once; a no-op until the bus runs). */
export function tapCutMeter(element: HTMLMediaElement): void {
  if (tapped.has(element) || !bus) return;
  if (bus.context.state !== 'running') {
    waiting.add(element);
    return;
  }
  if (!readable(element)) return;
  try {
    bus.context.createMediaElementSource(element).connect(bus.input);
    tapped.add(element);
  } catch {
    // Already owned by another source node, or the browser refused: it keeps playing as is.
    tapped.add(element);
  }
}

/** Play an element through the meters (what the monitor's `.play()` calls go through). */
export function playMetered(element: HTMLMediaElement): Promise<void> {
  tapCutMeter(element);
  return element.play();
}

export type CutMeterReading = {
  /** Peak level per channel, dBFS (−Infinity for silence). */
  peakDb: [number, number];
  /** RMS level per channel, dBFS. */
  rmsDb: [number, number];
};

const buffers = new WeakMap<AnalyserNode, Float32Array<ArrayBuffer>>();

function samplesOf(analyser: AnalyserNode): Float32Array<ArrayBuffer> {
  let buffer = buffers.get(analyser);
  if (!buffer || buffer.length !== analyser.fftSize) {
    buffer = new Float32Array(analyser.fftSize);
    buffers.set(analyser, buffer);
  }
  analyser.getFloatTimeDomainData(buffer);
  return buffer;
}

/** The levels right now, or null while the bus isn't running. */
export function readCutMeter(): CutMeterReading | null {
  if (!bus || bus.context.state !== 'running') return null;
  const l = levelsOf(samplesOf(bus.left));
  const r = levelsOf(samplesOf(bus.right));
  return { peakDb: [l.peakDb, r.peakDb], rmsDb: [l.rmsDb, r.rmsDb] };
}

/** Peak and RMS of a block of samples (−1…1), in dBFS. Pure. */
export function levelsOf(samples: ArrayLike<number>): { peakDb: number; rmsDb: number } {
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.abs(samples[i]!);
    if (value > peak) peak = value;
    sum += value * value;
  }
  const rms = samples.length ? Math.sqrt(sum / samples.length) : 0;
  const db = (value: number) => (value > 0 ? 20 * Math.log10(value) : -Infinity);
  return { peakDb: db(peak), rmsDb: db(rms) };
}

/** The meter's floor: anything quieter reads as empty. */
export const METER_FLOOR_DB = -60;

/** How full a meter bar is for a level, 0–1 (linear in dB from the floor to 0 dBFS). Pure. */
export function meterFraction(db: number): number {
  if (!Number.isFinite(db) || db <= METER_FLOOR_DB) return 0;
  return Math.min(1, (db - METER_FLOOR_DB) / -METER_FLOOR_DB);
}

/** A peak at or above this is shown as clipping (true peaks run over sample peaks). */
export const METER_CLIP_DB = -0.5;
