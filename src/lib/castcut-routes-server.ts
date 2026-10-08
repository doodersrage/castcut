/**
 * Server-only: the Castcut node pack's HTTP routes (castcut-nodes 1.2.0+, castcut_nodes.py
 * "HTTP routes"). They answer face checks and copy files inside ComfyUI without the render queue:
 * a face check queued as a graph waited for the render in progress (45–95 s on Edit 2511) for
 * ~0.5 s of work, and staged its still by downloading it and uploading it again.
 *
 * Every caller keeps its queued-graph path: no pack, an older pack, or a route that fails all
 * fall back to it. Parity (2026-10-06, ComfyUI's own Python, 12 of the user's stills): face
 * distances matched FaceEmbedDistance to 7e-8 and face boxes FaceBoundingBox exactly.
 */

import type { ComfyImageRef } from '@/lib/comfy-utility-graph-server';
import { inputNamePrefix } from '@/lib/comfy-input-name';

export type CastcutRoutesInfo = {
  version: string;
  routes: string[];
  faceAnalysis: boolean;
  /** DWPose (comfyui_controlnet_aux) is installed, for the `pose` op (1.3.0+). */
  dwpose: boolean;
  /** The Impact Pack's person segmentation is installed too, for `person-poses` (1.4.0+). */
  personRead: boolean;
  /** The Impact Pack's count nodes too, for `duo-counts` (1.6.0+). */
  duoCounts: boolean;
  /** `analyze` ops this pack answers ("face-distance", "face-boxes", "face-probe", "pose"). */
  ops: string[];
};

const INFO_TTL_MS = 5 * 60 * 1000;
/** A ComfyUI without the routes is asked again after a minute (the pack may be installed). */
const MISSING_TTL_MS = 60 * 1000;
const infoCache = new Map<string, { at: number; info: CastcutRoutesInfo | null }>();

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function hostKey(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

/** Drop what is known about a ComfyUI's routes (tests; after the pack is installed). */
export function forgetCastcutRoutes(baseUrl?: string): void {
  if (baseUrl === undefined) infoCache.clear();
  else infoCache.delete(hostKey(baseUrl));
}

export function parseCastcutRoutesInfo(payload: unknown): CastcutRoutesInfo | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as Record<string, unknown>;
  if (typeof body.version !== 'string' || !Array.isArray(body.routes)) return null;
  const analyze = (body.analyze ?? {}) as Record<string, unknown>;
  return {
    version: body.version,
    routes: body.routes.filter((route): route is string => typeof route === 'string'),
    faceAnalysis: analyze.faceAnalysis === true,
    dwpose: analyze.dwpose === true,
    personRead: analyze.personRead === true,
    duoCounts: analyze.duoCounts === true,
    ops: Array.isArray(analyze.ops)
      ? analyze.ops.filter((op): op is string => typeof op === 'string')
      : // 1.2.0 listed the two face ops it had.
        ['face-distance', 'face-boxes'],
  };
}

/** The pack's routes on this ComfyUI, or null (no pack, or one from before 1.2.0). Cached. */
export async function castcutRoutes(
  baseUrl: string,
  fetchImpl: FetchLike = fetch
): Promise<CastcutRoutesInfo | null> {
  const host = hostKey(baseUrl);
  const cached = infoCache.get(host);
  if (cached && Date.now() - cached.at < (cached.info ? INFO_TTL_MS : MISSING_TTL_MS)) {
    return cached.info;
  }
  let info: CastcutRoutesInfo | null = null;
  try {
    const response = await fetchImpl(`${host}/castcut/info`, {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    info = response.ok ? parseCastcutRoutesInfo(await response.json()) : null;
  } catch {
    info = null;
  }
  infoCache.set(host, { at: Date.now(), info });
  return info;
}

async function postJson<T>(
  url: string,
  body: unknown,
  timeoutMs: number,
  fetchImpl: FetchLike
): Promise<T> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !payload) {
    throw new Error(
      `Castcut ${new URL(url).pathname} failed (HTTP ${response.status})${payload?.error ? `: ${payload.error}` : ''}`
    );
  }
  return payload;
}

/** A ComfyUI file the routes read in place (no staging), or picture bytes sent along. */
export type CastcutImageSource = ComfyImageRef | { data: string };

function sourceBody(source: CastcutImageSource): Record<string, string> {
  return 'data' in source
    ? { data: source.data }
    : { filename: source.filename, subfolder: source.subfolder ?? '', type: source.type };
}

/**
 * Cosine distance of each image's largest face to the reference's, as FaceEmbedDistance gives it
 * (100 = no face). `null` when the reference shows no face.
 */
export async function castcutFaceDistances(
  baseUrl: string,
  input: { reference: CastcutImageSource; images: CastcutImageSource[]; timeoutMs?: number },
  fetchImpl: FetchLike = fetch
): Promise<number[] | null> {
  const result = await postJson<{ distances?: unknown; error?: string }>(
    `${hostKey(baseUrl)}/castcut/analyze`,
    {
      op: 'face-distance',
      // CPU: no fight with the render for the GPU (~0.5 s a still on CPU).
      provider: 'CPU',
      reference: sourceBody(input.reference),
      images: input.images.map(sourceBody),
    },
    input.timeoutMs ?? 30_000,
    fetchImpl
  );
  if (result.error === 'no-face-in-reference') return null;
  if (!Array.isArray(result.distances)) throw new Error('Castcut analyze returned no distances.');
  return result.distances.map(value => (typeof value === 'number' ? value : 100));
}

export type CastcutFaceBoxTurn = {
  rotation: string;
  boxes: Array<{ x: number; y: number; width: number; height: number }>;
};

/**
 * Face boxes (FaceBoundingBox, padding 0) on the picture as is and, while none is found, turned
 * by each further rotation (ImageRotate names). One turn per entry, up to the first with a face.
 */
export async function castcutFaceBoxes(
  baseUrl: string,
  input: { image: CastcutImageSource; rotations: readonly string[]; timeoutMs?: number },
  fetchImpl: FetchLike = fetch
): Promise<CastcutFaceBoxTurn[]> {
  const result = await postJson<{ results?: unknown }>(
    `${hostKey(baseUrl)}/castcut/analyze`,
    {
      op: 'face-boxes',
      provider: 'CPU',
      image: sourceBody(input.image),
      rotations: input.rotations,
      stopAtFirst: true,
    },
    input.timeoutMs ?? 30_000,
    fetchImpl
  );
  if (!Array.isArray(result.results)) throw new Error('Castcut analyze returned no boxes.');
  return result.results as CastcutFaceBoxTurn[];
}

/**
 * Copy a ComfyUI file into its input folder under the name the app's uploads give the same bytes
 * (comfy-input-name.ts), inside ComfyUI — no download and upload. Returns the input name.
 */
export async function castcutStageAsInput(
  baseUrl: string,
  ref: ComfyImageRef,
  prefix: string,
  fetchImpl: FetchLike = fetch
): Promise<string> {
  const extension = (/\.[A-Za-z0-9]{1,5}$/.exec(ref.filename)?.[0] ?? '.png').toLowerCase();
  const staged = await postJson<{ name?: unknown; subfolder?: unknown }>(
    `${hostKey(baseUrl)}/castcut/stage`,
    {
      filename: ref.filename,
      subfolder: ref.subfolder ?? '',
      type: ref.type,
      prefix: inputNamePrefix(`${prefix}${extension}`),
      extension,
    },
    30_000,
    fetchImpl
  );
  if (typeof staged.name !== 'string' || !staged.name) {
    throw new Error('Castcut stage returned no name.');
  }
  const subfolder = typeof staged.subfolder === 'string' ? staged.subfolder : '';
  return subfolder ? `${subfolder}/${staged.name}` : staged.name;
}

/** Changes when ComfyUI's node list or model files change; null without the route. */
export async function castcutObjectInfoFingerprint(
  baseUrl: string,
  fetchImpl: FetchLike = fetch
): Promise<string | null> {
  const info = await castcutRoutes(baseUrl, fetchImpl);
  if (!info?.routes.includes('object-info-fingerprint')) return null;
  try {
    const response = await fetchImpl(`${hostKey(baseUrl)}/castcut/object-info-fingerprint`, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { fingerprint?: unknown };
    return typeof body.fingerprint === 'string' && body.fingerprint ? body.fingerprint : null;
  } catch {
    return null;
  }
}

/** The pack answers this `analyze` op (and what it needs is installed). */
export function castcutCanAnalyze(info: CastcutRoutesInfo | null, op: string): boolean {
  if (!info?.routes.includes('analyze') || !info.ops.includes(op)) return false;
  if (op === 'pose') return info.dwpose;
  if (op === 'person-poses') return info.dwpose && info.personRead;
  if (op === 'duo-counts') return info.dwpose && info.duoCounts;
  return info.faceAnalysis;
}

/**
 * Checks this app process sent to queued graphs because a pack route was missing or failed, by
 * kind — the other half of the pack's own counts (`/castcut/health` → usage).
 */
const fallbacks = new Map<string, number>();

export function recordCastcutFallback(kind: string): void {
  fallbacks.set(kind, (fallbacks.get(kind) ?? 0) + 1);
}

export function castcutFallbackCounts(): Record<string, number> {
  return Object.fromEntries([...fallbacks.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/** Tests. */
export function resetCastcutFallbackCounts(): void {
  fallbacks.clear();
}

export type CastcutProbedFace = { x: number; distance: number };

/**
 * The Face finish probe (face-finish.ts buildLeadFaceProbeGraph) in one call: the `count` largest
 * faces, each cropped with `paddingPercent` and compared with the reference. [] when the still
 * shows no face; null when the reference shows none.
 */
export async function castcutFaceProbe(
  baseUrl: string,
  input: {
    image: CastcutImageSource;
    reference: CastcutImageSource;
    paddingPercent?: number;
    count?: number;
    timeoutMs?: number;
  },
  fetchImpl: FetchLike = fetch
): Promise<CastcutProbedFace[] | null> {
  const result = await postJson<{ faces?: unknown; error?: string }>(
    `${hostKey(baseUrl)}/castcut/analyze`,
    {
      op: 'face-probe',
      provider: 'CPU',
      image: sourceBody(input.image),
      reference: sourceBody(input.reference),
      paddingPercent: input.paddingPercent ?? 0.3,
      count: input.count ?? 2,
    },
    input.timeoutMs ?? 30_000,
    fetchImpl
  );
  if (result.error === 'no-face-in-reference') return null;
  if (!Array.isArray(result.faces)) throw new Error('Castcut analyze returned no faces.');
  return result.faces as CastcutProbedFace[];
}

/**
 * DWPose's `openpose_json` for one picture (body + hands, no face, as the pose-check graph asks),
 * read on the CPU inside ComfyUI. Null when DWPose is not installed.
 */
export async function castcutPoseJson(
  baseUrl: string,
  input: { image: CastcutImageSource; timeoutMs?: number },
  fetchImpl: FetchLike = fetch
): Promise<string | null> {
  const result = await postJson<{ openpose_json?: unknown; error?: string }>(
    `${hostKey(baseUrl)}/castcut/analyze`,
    { op: 'pose', image: sourceBody(input.image), hands: true, body: true, face: false },
    input.timeoutMs ?? 60_000,
    fetchImpl
  );
  if (result.error === 'no-dwpose') return null;
  if (typeof result.openpose_json !== 'string') throw new Error('Castcut pose returned no JSON.');
  return result.openpose_json;
}

export type CastcutInputDeleteResult = {
  deleted: string[];
  freedBytes: number;
  skipped: Array<{ name: string; reason: string }>;
};

/**
 * Remove these files from ComfyUI's input folder. The pack deletes only plain names in the
 * folder's top level, at least `minAgeSeconds` old (never under a day), that no running or
 * pending job names. The caller decides which names; this only asks.
 */
export async function castcutInputDelete(
  baseUrl: string,
  input: { names: readonly string[]; minAgeSeconds: number },
  fetchImpl: FetchLike = fetch
): Promise<CastcutInputDeleteResult> {
  const result = await postJson<Partial<CastcutInputDeleteResult>>(
    `${hostKey(baseUrl)}/castcut/input-delete`,
    { names: input.names, minAgeSeconds: input.minAgeSeconds },
    120_000,
    fetchImpl
  );
  return {
    deleted: Array.isArray(result.deleted) ? result.deleted.filter(n => typeof n === 'string') : [],
    freedBytes: typeof result.freedBytes === 'number' ? result.freedBytes : 0,
    skipped: Array.isArray(result.skipped) ? result.skipped : [],
  };
}

export type CastcutUsage = {
  /** When the pack's routes were registered (ComfyUI start), ms since epoch. */
  since: number | null;
  routes: Record<string, { served: number; errors: number; avgMs: number }>;
};

export type CastcutHealth = {
  version: string;
  queue: { running: number; pending: number };
  faceAnalysis: boolean;
  dwpose: boolean;
  personRead?: boolean;
  usage?: CastcutUsage;
  analyzersLoaded?: { face: boolean; pose: boolean };
  vram?: { freeBytes: number; totalBytes: number };
  loadedModels?: string[];
};

/** One call for what ComfyUI is doing: queue, free VRAM, loaded models, the pack's analyzers. */
export async function castcutHealth(
  baseUrl: string,
  fetchImpl: FetchLike = fetch
): Promise<CastcutHealth | null> {
  const info = await castcutRoutes(baseUrl, fetchImpl);
  if (!info?.routes.includes('health')) return null;
  try {
    const response = await fetchImpl(`${hostKey(baseUrl)}/castcut/health`, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body = (await response.json()) as CastcutHealth;
    return typeof body?.version === 'string' ? body : null;
  } catch {
    return null;
  }
}

/**
 * The two-person pose read (pose-person-reads.ts buildPersonReadGraph) in one call: the Impact
 * Pack's person masks with YOLO on the CPU, each of the `count` largest people alone on grey,
 * DWPose on each — the graph's own node functions. One `openpose_json` per person read; null when
 * the packs it needs are missing.
 */
export async function castcutPersonPoses(
  baseUrl: string,
  input: { image: CastcutImageSource; model: string; count: number; timeoutMs?: number },
  fetchImpl: FetchLike = fetch
): Promise<string[] | null> {
  const result = await postJson<{ openpose_json?: unknown; error?: string }>(
    `${hostKey(baseUrl)}/castcut/analyze`,
    { op: 'person-poses', image: sourceBody(input.image), model: input.model, count: input.count },
    input.timeoutMs ?? 90_000,
    fetchImpl
  );
  if (result.error === 'no-person-read') return null;
  if (!Array.isArray(result.openpose_json)) {
    throw new Error('Castcut person read returned no JSON.');
  }
  return result.openpose_json.map(text => (typeof text === 'string' ? text : ''));
}

/**
 * A ComfyUI PNG's `prompt` text chunk (the API graph it was made with) without downloading the
 * picture. Undefined without the route (the caller downloads it); null when the PNG has none.
 */
export async function castcutPngPrompt(
  baseUrl: string,
  ref: ComfyImageRef,
  fetchImpl: FetchLike = fetch
): Promise<string | null | undefined> {
  const info = await castcutRoutes(baseUrl, fetchImpl);
  if (!info?.routes.includes('png-text')) return undefined;
  const params = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder ?? '',
    type: ref.type,
    keys: 'prompt',
  });
  try {
    const response = await fetchImpl(`${hostKey(baseUrl)}/castcut/png-text?${params}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      recordCastcutFallback('png-text');
      return undefined;
    }
    const body = (await response.json()) as { prompt?: unknown };
    return typeof body.prompt === 'string' ? body.prompt : null;
  } catch {
    recordCastcutFallback('png-text');
    return undefined;
  }
}

/** Detector counts by key ("faces", "hands", "penises", "vaginas") and the body-only DWPose read. */
export type CastcutDuoCounts = { counts: Record<string, number>; openposeJson: string };

/**
 * The duo count graph's reads in-process (duo-still-check.ts): each `{model, segm}` counted at the
 * graph's threshold, plus DWPose (body only). Null when this ComfyUI can't (nodes missing).
 */
export async function castcutDuoCounts(
  baseUrl: string,
  input: {
    image: CastcutImageSource;
    models: Record<string, { model: string; segm: boolean }>;
    threshold: number;
    timeoutMs?: number;
  },
  fetchImpl: FetchLike = fetch
): Promise<CastcutDuoCounts | null> {
  const result = await postJson<{ counts?: unknown; openpose_json?: unknown; error?: string }>(
    `${hostKey(baseUrl)}/castcut/analyze`,
    {
      op: 'duo-counts',
      image: sourceBody(input.image),
      models: input.models,
      threshold: input.threshold,
    },
    input.timeoutMs ?? 90_000,
    fetchImpl
  );
  if (result.error === 'no-duo-counts') return null;
  const counts = result.counts as Record<string, unknown> | undefined;
  if (!counts || typeof result.openpose_json !== 'string') {
    throw new Error('Castcut duo counts returned nothing.');
  }
  return {
    counts: Object.fromEntries(
      Object.entries(counts).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number'
      )
    ),
    openposeJson: result.openpose_json,
  };
}
