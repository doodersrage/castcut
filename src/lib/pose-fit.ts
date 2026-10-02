/**
 * "Fit to her picture" in the pose editor: scale and move a figure so it stands where the
 * person stands in the faint picture behind it.
 *
 * Without a detector, the person is found the plain way: Cast plates are one person on a flat
 * (usually white) ground, so the box of pixels that differ from the border colour is the
 * person. A busy studio photo has no flat border — the picture is then assumed to be the person
 * head to toe, centred, with a small margin.
 *
 * The figure is moved, not the picture: the saved pose is then the pose seen against her real
 * proportions, and it stays a normal 0–1 pose inside the canvas (a scaled picture would leave
 * the pose where it was and make the guide lie about it).
 *
 * Pure: no DOM. Boxes are fractions (0–1) of whatever they are measured on.
 */

import type { NormalizedBody } from '@/lib/pose-library';

type XY = { x: number; y: number };

/** Left / top / right / bottom as fractions of an image or the canvas. */
export type FitBox = { left: number; top: number; right: number; bottom: number };

/** The person when the picture cannot be measured: full height, centred, a 4% margin. */
export const ASSUMED_SUBJECT: FitBox = { left: 0.3, top: 0.04, right: 0.7, bottom: 0.96 };

/**
 * Nose → neck → hips → knees → ankles, as a share of standing height (crown to sole). An adult
 * stands about eight heads: the nose sits ~0.075 below the crown and the ankle ~0.04 above the
 * sole, which leaves ~0.885 for the chain.
 */
const CHAIN_SHARE = 0.885;
/** Crown above the nose, as a share of standing height. */
const CROWN_ABOVE_NOSE = 0.075;
/** Crown above the neck when the face is missing. */
const CROWN_ABOVE_NECK = 0.17;
/** How close to the canvas edge a fitted joint may sit. */
const EDGE = 0.01;

/** Pixels this far (sum of RGB differences) from the ground colour are the person. */
const INK = 60;
/** Faded-out pixels of a cut-out PNG count as ground. */
const SEE_THROUGH = 32;

/**
 * The person's box in an RGBA pixel buffer (ImageData's layout), or null when the ground is not
 * one flat colour (a studio or street photo) or nothing stands out from it.
 */
export function subjectBoxFromPixels(
  data: ArrayLike<number>,
  width: number,
  height: number
): FitBox | null {
  if (width < 4 || height < 4 || data.length < width * height * 4) return null;
  const at = (x: number, y: number) => (y * width + x) * 4;
  // The ground colour: the median of the border, per channel.
  const border: number[] = [];
  for (let x = 0; x < width; x++) border.push(at(x, 0), at(x, height - 1));
  for (let y = 1; y < height - 1; y++) border.push(at(0, y), at(width - 1, y));
  const opaque = border.filter(i => (data[i + 3] ?? 255) >= SEE_THROUGH);
  const median = (channel: number) => {
    const values = opaque.map(i => data[i + channel] ?? 0).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] ?? 0;
  };
  const ground = opaque.length > 0 ? [median(0), median(1), median(2)] : [0, 0, 0];
  const isInk = (i: number) =>
    (data[i + 3] ?? 255) >= SEE_THROUGH &&
    (opaque.length === 0 ||
      Math.abs((data[i] ?? 0) - ground[0]!) +
        Math.abs((data[i + 1] ?? 0) - ground[1]!) +
        Math.abs((data[i + 2] ?? 0) - ground[2]!) >
        INK);
  // A border that is mostly not the ground colour: not a plate on a flat ground.
  if (border.filter(isInk).length > border.length * 0.3) return null;
  const rows = new Array<number>(height).fill(0);
  const columns = new Array<number>(width).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isInk(at(x, y))) continue;
      rows[y]! += 1;
      columns[x]! += 1;
    }
  }
  // A few stray pixels (noise, a watermark speck) are not the person.
  const rowMin = Math.max(1, Math.round(width * 0.015));
  const columnMin = Math.max(1, Math.round(height * 0.015));
  const top = rows.findIndex(count => count >= rowMin);
  const bottom = rows.findLastIndex(count => count >= rowMin);
  const left = columns.findIndex(count => count >= columnMin);
  const right = columns.findLastIndex(count => count >= columnMin);
  if (top < 0 || left < 0) return null;
  const box = {
    left: left / width,
    top: top / height,
    right: (right + 1) / width,
    bottom: (bottom + 1) / height,
  };
  // Too short to be a person standing in the picture (a logo, a crop of a hand).
  return box.bottom - box.top >= 0.25 ? box : null;
}

/**
 * Where a box on the picture lands on the canvas: the picture is drawn whole and centred
 * ("meet"), so a picture of another shape leaves bars at the sides or top and bottom. Aspects are
 * width / height.
 */
export function imageBoxOnCanvas(box: FitBox, imageAspect: number, canvasAspect: number): FitBox {
  const image = imageAspect > 0 ? imageAspect : canvasAspect;
  // Drawn size in canvas units (canvas = canvasAspect wide, 1 high).
  const drawnWidth = image >= canvasAspect ? canvasAspect : image;
  const drawnHeight = image >= canvasAspect ? canvasAspect / image : 1;
  const offsetX = (canvasAspect - drawnWidth) / 2;
  const offsetY = (1 - drawnHeight) / 2;
  return {
    left: (offsetX + box.left * drawnWidth) / canvasAspect,
    right: (offsetX + box.right * drawnWidth) / canvasAspect,
    top: offsetY + box.top * drawnHeight,
    bottom: offsetY + box.bottom * drawnHeight,
  };
}

const distance = (a: XY | null | undefined, b: XY | null | undefined, aspect: number) =>
  a && b ? Math.hypot((a.x - b.x) * aspect, a.y - b.y) : null;

const mean = (values: Array<number | null>) => {
  const known = values.filter((v): v is number => v != null);
  return known.length ? known.reduce((sum, v) => sum + v, 0) / known.length : null;
};

/**
 * How tall the figure would stand (crown to sole, canvas heights), from its bone lengths rather
 * than its box, so a sitting or bent figure is sized as the same person standing.
 */
export function figureStandingHeight(body: NormalizedBody, aspect: number): number | null {
  const a = aspect > 0 ? aspect : 1;
  const neck = body[1];
  const hips = [body[8], body[11]].filter(Boolean) as XY[];
  if (!neck || hips.length === 0) return null;
  const hip = {
    x: hips.reduce((s, p) => s + p.x, 0) / hips.length,
    y: hips.reduce((s, p) => s + p.y, 0) / hips.length,
  };
  const torso = distance(neck, hip, a)!;
  if (torso <= 0) return null;
  // The face is short and often turned: missing, it is taken as the standing starter's share.
  const head = distance(body[0], neck, a) ?? torso * 0.28;
  const thigh = mean([distance(body[8], body[9], a), distance(body[11], body[12], a)]);
  const shin = mean([distance(body[9], body[10], a), distance(body[12], body[13], a)]);
  // Legs out of the picture: the standing starter's legs are each ~0.67 of its torso.
  const legs = (thigh ?? torso * 0.67) + (shin ?? torso * 0.67);
  return (head + torso + legs) / CHAIN_SHARE;
}

/**
 * Scale and move a figure (keeping its pose) so its crown sits on the person's head in the
 * picture, its size matches theirs standing, and its neck is over their middle. `subject` is in
 * canvas fractions (see {@link imageBoxOnCanvas}). The result stays inside the canvas: a figure
 * that would not fit is shrunk and nudged in. Null when the figure has no torso to measure.
 */
export function fitBodyToBox(
  body: NormalizedBody,
  subject: FitBox,
  aspect: number
): { body: NormalizedBody; scale: number } | null {
  const a = aspect > 0 ? aspect : 1;
  const standing = figureStandingHeight(body, a);
  const neck = body[1];
  if (standing == null || !neck) return null;
  const nose = body[0];
  const crown = nose ? nose.y - CROWN_ABOVE_NOSE * standing : neck.y - CROWN_ABOVE_NECK * standing;
  let scale = Math.max(0.05, (subject.bottom - subject.top) / standing);
  const centreX = (subject.left + subject.right) / 2;
  const place = (s: number, dx = 0, dy = 0) =>
    body.map(p =>
      p ? { x: centreX + (p.x - neck.x) * s + dx, y: subject.top + (p.y - crown) * s + dy } : null
    );
  const extent = (placed: NormalizedBody) => {
    const points = placed.filter(Boolean) as XY[];
    return {
      left: Math.min(...points.map(p => p.x)),
      right: Math.max(...points.map(p => p.x)),
      top: Math.min(...points.map(p => p.y)),
      bottom: Math.max(...points.map(p => p.y)),
    };
  };
  const room = 1 - 2 * EDGE;
  const sized = extent(place(scale));
  const tooBig = Math.max((sized.right - sized.left) / room, (sized.bottom - sized.top) / room, 1);
  scale /= tooBig;
  const box = extent(place(scale));
  const nudge = (low: number, high: number) =>
    low < EDGE ? EDGE - low : high > 1 - EDGE ? 1 - EDGE - high : 0;
  const placed = place(scale, nudge(box.left, box.right), nudge(box.top, box.bottom));
  return {
    body: placed.map(p =>
      p
        ? {
            x: Math.min(1 - EDGE, Math.max(EDGE, p.x)),
            y: Math.min(1 - EDGE, Math.max(EDGE, p.y)),
          }
        : null
    ),
    scale,
  };
}
