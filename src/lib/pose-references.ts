/**
 * Real-world reference poses: skeletons of people in Day's named poses, harvested by
 * `scripts/pose-refs/` into `public/pose-references.json` with their credit — read (DWPose) from
 * openly licensed photos, projected from CMU motion-capture clips, or mapped from COCO keypoint
 * annotations (`source`). No photo ships — only the joints.
 *
 * They are variants of a pose: variant 0 is always the hand-drawn figure (nothing changes for a
 * pose that has no references), and "Try another" (or a pose pack's next lap, or the pose check's
 * redo) walks variant 1 … N through the real references, then back to the drawing. A reference
 * stands in for the drawing only on the posture it was harvested for — a phone call drawn
 * seated ("on the phone on the sofa") keeps its drawing rather than borrowing a standing caller.
 *
 * The data file (`public/pose-references.json`, ~250 KB) loads on demand: `loadPoseReferences()`
 * (the pose previews and the guide builders call it), with a synchronous snapshot for the pure
 * planners.
 */

import type { NormalizedBody, PoseLibraryEntry } from '@/lib/pose-library';

/**
 * Licences a reference may come from: no NonCommercial, no NoDerivatives. `cmu` is the CMU
 * Graphics Lab Motion Capture Database's own terms (free for all uses, credit requested).
 */
export const POSE_REFERENCE_LICENCES = ['cc0', 'pdm', 'by', 'by-sa', 'cmu'] as const;
export type PoseReferenceLicence = (typeof POSE_REFERENCE_LICENCES)[number];

const LICENCE_NAMES: Record<PoseReferenceLicence, string> = {
  cc0: 'CC0',
  pdm: 'Public domain',
  by: 'CC BY',
  'by-sa': 'CC BY-SA',
  cmu: 'CMU mocap terms',
};

/** Where a reference skeleton was read from. */
export const POSE_REFERENCE_SOURCES = ['photo', 'cmu-mocap', 'coco'] as const;
export type PoseReferenceSource = (typeof POSE_REFERENCE_SOURCES)[number];

/** "a photo", "a motion-capture clip", "a COCO annotation": what the credit links to. */
export const POSE_REFERENCE_SOURCE_WORDS: Record<PoseReferenceSource, string> = {
  photo: 'a photo',
  'cmu-mocap': 'a motion-capture clip',
  coco: 'a COCO keypoint annotation',
};

const CREDIT_PREFIX: Record<PoseReferenceSource, string> = {
  photo: 'Photo',
  'cmu-mocap': 'Mocap',
  coco: 'Keypoints',
};

export type PoseReferenceCredit = {
  title: string;
  creator: string;
  creatorUrl?: string;
  licence: PoseReferenceLicence;
  licenceVersion?: string;
  licenceUrl: string;
  /** The photo's page (Wikimedia Commons, Flickr, …). */
  source: string;
  provider?: string;
};

export type PoseReference = {
  /** `${pose}-${variant}`. */
  id: string;
  /** Day pose id: a layout (`wave`, `hug`, `sport_squat`) or a posture (`sit`, `walk`). */
  pose: string;
  /** The guide posture the reference was harvested for (`stand`, `sit`, `lie`, …). */
  base: string;
  /** Where the skeleton was read from (a photo unless the data says otherwise). */
  source: PoseReferenceSource;
  /** 1-based: variant N of the pose is reference N. */
  variant: number;
  /** Width / height of the cropped photo the joints are normalized to. */
  aspect: number;
  /** COCO-18 bodies, 0–1 of the crop, lead first. */
  people: NormalizedBody[];
  credit: PoseReferenceCredit;
};

/** Where the full credits list lives (also linked from Settings → About). */
export const POSE_REFERENCE_CREDITS_URL =
  'https://github.com/doodersrage/castcut/blob/main/docs/pose-reference-credits.md';

const LICENCE_SET: ReadonlySet<string> = new Set(POSE_REFERENCE_LICENCES);
const SOURCE_SET: ReadonlySet<string> = new Set(POSE_REFERENCE_SOURCES);

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\/\S+$/.test(value);
}

function readBody(raw: unknown): NormalizedBody | null {
  if (!Array.isArray(raw) || raw.length !== 18) return null;
  const body: NormalizedBody = raw.map(point => {
    const p = point as { x?: unknown; y?: unknown } | null;
    return p &&
      typeof p.x === 'number' &&
      typeof p.y === 'number' &&
      p.x >= -0.05 &&
      p.x <= 1.05 &&
      p.y >= -0.05 &&
      p.y <= 1.05
      ? { x: p.x, y: p.y }
      : null;
  });
  // Neck, shoulders, hips, knees and ankles: a reference is a whole body.
  return [1, 2, 5, 8, 9, 10, 11, 12, 13].every(index => body[index]) ? body : null;
}

/** One data-file entry, checked: licence allowed, credit complete, skeleton whole. */
export function normalizePoseReference(raw: unknown): PoseReference | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const pose = text(record.pose);
  const base = text(record.base);
  const source = text(record.source) || 'photo';
  const variant = record.variant;
  const aspect = record.aspect;
  if (!pose || !base || !SOURCE_SET.has(source)) return null;
  if (typeof variant !== 'number' || !Number.isInteger(variant) || variant < 1) return null;
  if (typeof aspect !== 'number' || !(aspect > 0.1 && aspect < 10)) return null;
  if (!Array.isArray(record.people) || record.people.length < 1 || record.people.length > 2) {
    return null;
  }
  const people = record.people.map(readBody);
  if (people.some(body => body === null)) return null;
  const rawCredit = (record.credit ?? {}) as Record<string, unknown>;
  const licence = text(rawCredit.licence);
  const credit: PoseReferenceCredit = {
    title: text(rawCredit.title),
    creator: text(rawCredit.creator),
    licence: licence as PoseReferenceLicence,
    licenceUrl: text(rawCredit.licenceUrl),
    source: text(rawCredit.source),
    ...(text(rawCredit.licenceVersion) ? { licenceVersion: text(rawCredit.licenceVersion) } : {}),
    ...(isHttpUrl(rawCredit.creatorUrl) ? { creatorUrl: rawCredit.creatorUrl } : {}),
    ...(text(rawCredit.provider) ? { provider: text(rawCredit.provider) } : {}),
  };
  if (
    !LICENCE_SET.has(licence) ||
    // The CMU terms are the mocap database's own; everything else is a Creative Commons deed.
    (licence === 'cmu') !== (source === 'cmu-mocap') ||
    !credit.title ||
    !credit.creator ||
    !isHttpUrl(credit.licenceUrl) ||
    !isHttpUrl(credit.source)
  ) {
    return null;
  }
  return {
    id: text(record.id) || `${pose}-${variant}`,
    pose,
    base,
    source: source as PoseReferenceSource,
    variant,
    aspect,
    people: people as NormalizedBody[],
    credit,
  };
}

/** The data file's references, checked (bad entries dropped), in variant order per pose. */
export function parsePoseReferences(raw: unknown): PoseReference[] {
  const list = (raw as { references?: unknown } | null)?.references;
  if (!Array.isArray(list)) return [];
  return list
    .map(normalizePoseReference)
    .filter((ref): ref is PoseReference => ref !== null)
    .sort((a, b) => a.pose.localeCompare(b.pose) || a.variant - b.variant);
}

/** The references for one pose and headcount, variant order. */
export function poseReferencesFor(
  references: readonly PoseReference[],
  pose: string | null | undefined,
  people: number,
  base?: string | null
): PoseReference[] {
  const id = pose?.trim();
  if (!id) return [];
  return references.filter(
    ref => ref.pose === id && ref.people.length === people && (base == null || ref.base === base)
  );
}

/**
 * The reference a variant draws, or null for the hand-drawn figure. Variants cycle through the
 * drawing and every reference: with 3 references, 0 → drawing, 1–3 → references 1–3, 4 →
 * drawing, 5 → reference 1, …
 */
export function poseReferenceForVariant(
  candidates: readonly PoseReference[],
  variant: number | null | undefined
): PoseReference | null {
  if (candidates.length === 0) return null;
  const step = Math.max(0, Math.floor(variant ?? 0)) % (candidates.length + 1);
  return step === 0 ? null : (candidates[step - 1] ?? null);
}

/** A reference as a pose-library entry, so the guide planner places it like any harvested pose. */
export function poseReferenceAsLibraryEntry(
  ref: PoseReference,
  key = `${ref.pose}:${ref.people.length}`
): PoseLibraryEntry {
  return {
    id: `ref:${ref.id}`,
    key,
    aspect: ref.aspect,
    people: ref.people,
    score: 1,
    createdAt: 0,
  };
}

/** "CC BY-SA 2.0", "CC0", "Public domain". */
export function poseReferenceLicenceLabel(credit: PoseReferenceCredit): string {
  const name = LICENCE_NAMES[credit.licence];
  return (credit.licence === 'by' || credit.licence === 'by-sa') && credit.licenceVersion
    ? `${name} ${credit.licenceVersion}`
    : name;
}

/**
 * One-line credit: "Photo: Jane Doe (CC BY 2.0)", "Mocap: CMU Graphics Lab Motion Capture
 * Database (CMU mocap terms)".
 */
export function poseReferenceCreditLine(ref: PoseReference): string {
  return `${CREDIT_PREFIX[ref.source]}: ${ref.credit.creator} (${poseReferenceLicenceLabel(ref.credit)})`;
}

/** The credit without its "Photo:" / "Mocap:" prefix, for a line that already says the source. */
export function poseReferenceCreditText(ref: PoseReference): string {
  return `${ref.credit.creator} (${poseReferenceLicenceLabel(ref.credit)})`;
}

// --- lazy store -------------------------------------------------------------------------------

const EMPTY: readonly PoseReference[] = Object.freeze([]);
let loaded: PoseReference[] | null = null;
let pending: Promise<PoseReference[]> | null = null;
const listeners = new Set<() => void>();

/** References loaded so far (empty until {@link loadPoseReferences} resolves). */
export function loadedPoseReferences(): readonly PoseReference[] {
  return loaded ?? EMPTY;
}

/**
 * The data file, served from `public/` rather than bundled: as an imported JSON module it was a
 * ~46 KB gzip JS chunk counted against the client bundle budget (size-limit), and a static file
 * is cached by the browser like any other asset.
 */
export const POSE_REFERENCES_PATH = '/pose-references.json';

async function readPoseReferencesPayload(): Promise<unknown> {
  if (typeof window === 'undefined') {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    return JSON.parse(
      await readFile(join(process.cwd(), 'public', POSE_REFERENCES_PATH), 'utf8')
    ) as unknown;
  }
  const response = await fetch(POSE_REFERENCES_PATH);
  if (!response.ok) throw new Error(`Pose references failed (${response.status})`);
  return response.json();
}

/**
 * Load the data file once. Never rejects: no references on failure (and a later call tries
 * again, so one dropped request does not hide them for the session).
 */
export function loadPoseReferences(): Promise<PoseReference[]> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= readPoseReferencesPayload()
    .then(raw => {
      const references = parsePoseReferences(raw);
      loaded = references;
      for (const listener of listeners) listener();
      return references;
    })
    .catch(() => {
      pending = null;
      return [] as PoseReference[];
    });
  return pending;
}

/** For `useSyncExternalStore`. */
export function subscribePoseReferences(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Tests: replace the loaded set (null = unload). */
export function setLoadedPoseReferencesForTest(references: PoseReference[] | null): void {
  loaded = references;
  pending = null;
}
