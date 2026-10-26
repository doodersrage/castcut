/**
 * A film's loudness (M4 F4, ROADMAP §7.3 / §7.6): integrated loudness (LUFS), loudness range
 * (LU) and true peak (dBTP), read from ffmpeg's ebur128 summary, and how it sits against a
 * delivery target — the web's −14 LUFS or broadcast's −23 (EBU R128), true peak under −1 dBTP.
 * Pure; the measurement runs on the server (loudness-server.ts).
 */

import type { FilmLoudness } from '../video/output-probe';

export { parseEbur128Summary, type FilmLoudness } from '../video/output-probe';

export type LoudnessTarget = { id: string; label: string; lufs: number; peakDbtp: number };

export const LOUDNESS_TARGETS: readonly LoudnessTarget[] = [
  { id: 'web', label: 'Web and social (−14 LUFS)', lufs: -14, peakDbtp: -1 },
  { id: 'broadcast', label: 'Broadcast, EBU R128 (−23 LUFS)', lufs: -23, peakDbtp: -1 },
];

/** How far from the target's loudness still counts as on it, in LU. */
export const LOUDNESS_TOLERANCE_LU = 2;

/** A level with a real minus sign: "−14.0". */
const signed = (value: number, digits = 1) =>
  value < 0 ? `−${Math.abs(value).toFixed(digits)}` : value.toFixed(digits);

/** "−15.8 LUFS · range 6.1 LU · peak −1.4 dBTP". */
export function loudnessSummary(loudness: FilmLoudness): string {
  const sign = (value: number) => signed(value);
  return [
    `${sign(loudness.integratedLufs)} LUFS`,
    loudness.rangeLu !== undefined ? `range ${loudness.rangeLu.toFixed(1)} LU` : '',
    loudness.truePeakDbtp !== undefined ? `peak ${sign(loudness.truePeakDbtp)} dBTP` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** What is off against a target (empty: on target). */
export function loudnessNotes(loudness: FilmLoudness, target: LoudnessTarget): string[] {
  const notes: string[] = [];
  const off = loudness.integratedLufs - target.lufs;
  if (Math.abs(off) > LOUDNESS_TOLERANCE_LU) {
    notes.push(
      `${Math.abs(off).toFixed(1)} LU ${off > 0 ? 'louder' : 'quieter'} than ${signed(target.lufs, 0)} LUFS — ${
        off > 0 ? 'turn the music or lines down' : 'turn the music or lines up'
      }`
    );
  }
  if (loudness.truePeakDbtp !== undefined && loudness.truePeakDbtp > target.peakDbtp) {
    notes.push(
      `peaks at ${signed(loudness.truePeakDbtp)} dBTP, over ${signed(target.peakDbtp, 0)} — it may clip on some players`
    );
  }
  return notes;
}
