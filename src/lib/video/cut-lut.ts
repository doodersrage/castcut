/**
 * A colour LUT for the whole film, from a .cube file (Resolve, Premiere, stock LUT packs). Read in
 * the browser, resampled to a 17-point cube and kept with the cut as 16-bit values (about 40 KB of
 * base64) — no upload, and Undo / versions keep it. The render applies the cube itself (ffmpeg
 * lut3d); the monitor, which draws through a colour matrix, applies the matrix that fits the cube
 * best (least squares) — close for the usual grades, not for extreme ones. Pure.
 */

import type { ColourMatrix } from './cut-look';

/** A 3D LUT: `size` points per axis, RGB triples with red changing fastest (the .cube order). */
export type CubeLut = { size: number; data: Float32Array };

/** What the cut keeps: the file's name, the cube's size and its values as base64 16-bit. */
export type StoredLut = { name: string; size: number; data: string };

/** The size the cut keeps every LUT at. */
export const STORED_LUT_SIZE = 17;

/** A .cube file's 3D LUT, or an error message a person can act on. */
export function parseCubeLut(text: string): CubeLut | { error: string } {
  let size = 0;
  let min = [0, 0, 0];
  let max = [1, 1, 1];
  const values: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [key, ...rest] = line.split(/\s+/);
    if (key === 'LUT_3D_SIZE') {
      size = Number(rest[0]);
    } else if (key === 'LUT_1D_SIZE') {
      return { error: 'That is a 1D LUT — pick a 3D .cube.' };
    } else if (key === 'DOMAIN_MIN') {
      min = rest.slice(0, 3).map(Number);
    } else if (key === 'DOMAIN_MAX') {
      max = rest.slice(0, 3).map(Number);
    } else if (/^[-+.\d]/.test(key ?? '')) {
      const triple = [key, ...rest].slice(0, 3).map(Number);
      if (triple.length === 3 && triple.every(Number.isFinite)) values.push(...triple);
    }
  }
  if (!Number.isInteger(size) || size < 2 || size > 65) {
    return { error: 'No LUT_3D_SIZE in that file — is it a .cube LUT?' };
  }
  if (values.length !== size * size * size * 3) {
    return { error: `The file says ${size}³ points but has ${values.length / 3}.` };
  }
  // Values in the file's domain → 0–1.
  const data = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    const c = i % 3;
    const span = max[c]! - min[c]! || 1;
    data[i] = Math.min(1, Math.max(0, (values[i]! - min[c]!) / span));
  }
  return { size, data };
}

/** The LUT's colour for an input colour (0–1 RGB), trilinear between its points. */
export function sampleLut(lut: CubeLut, rgb: readonly [number, number, number]): number[] {
  const n = lut.size - 1;
  const pos = rgb.map(v => Math.min(n, Math.max(0, v * n)));
  const lo = pos.map(Math.floor);
  const hi = lo.map(v => Math.min(n, v + 1));
  const f = pos.map((v, i) => v - lo[i]!);
  const at = (r: number, g: number, b: number, c: number) =>
    lut.data[((b * lut.size + g) * lut.size + r) * 3 + c]!;
  const out: number[] = [];
  for (let c = 0; c < 3; c += 1) {
    let value = 0;
    for (let k = 0; k < 8; k += 1) {
      const r = k & 1 ? hi[0]! : lo[0]!;
      const g = k & 2 ? hi[1]! : lo[1]!;
      const b = k & 4 ? hi[2]! : lo[2]!;
      const w =
        (k & 1 ? f[0]! : 1 - f[0]!) * (k & 2 ? f[1]! : 1 - f[1]!) * (k & 4 ? f[2]! : 1 - f[2]!);
      value += w * at(r, g, b, c);
    }
    out.push(value);
  }
  return out;
}

/** The LUT at another size (the cut keeps STORED_LUT_SIZE). */
export function resampleLut(lut: CubeLut, size = STORED_LUT_SIZE): CubeLut {
  if (lut.size === size) return lut;
  const data = new Float32Array(size * size * size * 3);
  let i = 0;
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        const out = sampleLut(lut, [r / (size - 1), g / (size - 1), b / (size - 1)]);
        data[i++] = out[0]!;
        data[i++] = out[1]!;
        data[i++] = out[2]!;
      }
    }
  }
  return { size, data };
}

const toBase64 = (bytes: Uint8Array) =>
  typeof Buffer !== 'undefined'
    ? Buffer.from(bytes).toString('base64')
    : btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
const fromBase64 = (text: string) =>
  typeof Buffer !== 'undefined'
    ? new Uint8Array(Buffer.from(text, 'base64'))
    : Uint8Array.from(atob(text), char => char.charCodeAt(0));

/** The LUT as the cut keeps it (16-bit values, little-endian, base64). */
export function storeLut(name: string, lut: CubeLut): StoredLut {
  const small = resampleLut(lut);
  const bytes = new Uint8Array(small.data.length * 2);
  small.data.forEach((value, index) => {
    const v = Math.round(Math.min(1, Math.max(0, value)) * 65535);
    bytes[index * 2] = v & 0xff;
    bytes[index * 2 + 1] = v >> 8;
  });
  return { name: name.slice(0, 120), size: small.size, data: toBase64(bytes) };
}

/** A kept LUT back as a cube, or null when it doesn't read (wrong size, damaged). */
export function loadStoredLut(stored: unknown): CubeLut | null {
  if (!stored || typeof stored !== 'object') return null;
  const record = stored as Partial<StoredLut>;
  const size = Number(record.size);
  if (!Number.isInteger(size) || size < 2 || size > 33 || typeof record.data !== 'string') {
    return null;
  }
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(record.data);
  } catch {
    return null;
  }
  const count = size * size * size * 3;
  if (bytes.length !== count * 2) return null;
  const data = new Float32Array(count);
  for (let i = 0; i < count; i += 1) data[i] = (bytes[i * 2]! | (bytes[i * 2 + 1]! << 8)) / 65535;
  return { size, data };
}

/** The cube as a .cube file (for ffmpeg's lut3d). */
export function lutToCube(lut: CubeLut): string {
  const lines = ['TITLE "Castcut"', `LUT_3D_SIZE ${lut.size}`];
  for (let i = 0; i < lut.data.length; i += 3) {
    lines.push(
      `${lut.data[i]!.toFixed(6)} ${lut.data[i + 1]!.toFixed(6)} ${lut.data[i + 2]!.toFixed(6)}`
    );
  }
  return `${lines.join('\n')}\n`;
}

/** Solve a 4×4 linear system (Gaussian elimination with pivoting); null when singular. */
function solve4(a: number[][], b: number[]): number[] | null {
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < 4; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 4; row += 1) {
      if (Math.abs(m[row]![col]!) > Math.abs(m[pivot]![col]!)) pivot = row;
    }
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let row = 0; row < 4; row += 1) {
      if (row === col) continue;
      const factor = m[row]![col]! / m[col]![col]!;
      for (let k = col; k < 5; k += 1) m[row]![k]! -= factor * m[col]![k]!;
    }
  }
  return m.map((row, i) => row[4]! / row[i]!);
}

/**
 * The 3×4 colour matrix closest to the LUT (least squares over its points) — what the monitor
 * draws, since it can only apply a matrix.
 */
export function lutFitMatrix(lut: CubeLut): ColourMatrix {
  const ata = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  const atb = [0, 1, 2].map(() => [0, 0, 0, 0]);
  const n = lut.size;
  for (let b = 0; b < n; b += 1) {
    for (let g = 0; g < n; g += 1) {
      for (let r = 0; r < n; r += 1) {
        const x = [r / (n - 1), g / (n - 1), b / (n - 1), 1];
        const index = ((b * n + g) * n + r) * 3;
        for (let i = 0; i < 4; i += 1) {
          for (let j = 0; j < 4; j += 1) ata[i]![j]! += x[i]! * x[j]!;
          for (let c = 0; c < 3; c += 1) atb[c]![i]! += x[i]! * lut.data[index + c]!;
        }
      }
    }
  }
  const out: number[] = [];
  for (let c = 0; c < 3; c += 1) {
    const row = solve4(ata, atb[c]!);
    if (!row) return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    out.push(...row.map(value => Number(value.toFixed(5))));
  }
  return out;
}
