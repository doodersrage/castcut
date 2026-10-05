import { isContentAddressedInputName } from './comfy-input-name';

/**
 * Which files in ComfyUI's input folder the app made and nothing points at any more.
 *
 * ComfyUI has no API to delete an input, and its folder usually belongs to the ComfyUI service
 * user, so Settings → ComfyUI → Input folder only reports: the app-made files no gallery entry,
 * Cast look, Day / Story state or queued job names, older than a week, and a shell command the
 * player can read and run. Everything here is pure so the rules are tested, not trusted.
 */

/** Name starts the app gives its uploads (followed by "-", "_", "." or the end). */
export const APP_INPUT_PREFIXES = [
  'cast-face-crop',
  'cast-plate',
  'castcut-isolate',
  'clip-last-frame',
  'compose-image',
  'controlnet-ref',
  'day-dress-plate',
  'day-end-pose',
  'day-face-id-ref',
  'day-face-neutral',
  'day-garment',
  'day-identity-rl',
  'day-nude-face',
  'day-outfit',
  'day-partner',
  'day-plate',
  'day-pose-guide',
  'day-still',
  'day-vacation-face',
  'day-vacation-id-vl',
  'day-vacation-keep',
  'face-check',
  'face-finish',
  'face-locate',
  'fitting-garment',
  'fitting-ref',
  'footwear',
  'gallery-face',
  'inpaint-source',
  'moodboard',
  'outfit-footwear',
  'outpaint-mask',
  'outpaint-source',
  'pose-check',
  'pose-still',
  'preview-control',
  'preview-input',
  'preview-mask',
  'prompt-studio',
  'refine-source',
  'roleplay-last-frame',
  'roleplay-photo',
  'roleplay-ref',
  'story-garment',
  'story-nude-face',
  'story-pose-guide',
  'video-init',
  'video-last-frame',
  'vision-frame',
  'vision-still',
] as const;

/** A week: anything newer may belong to a Day or Story that has not synced yet. */
export const INPUT_CLEANUP_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Names the reference scan can find as one token; anything else is never offered for removal. */
const PLAIN_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.[A-Za-z0-9]{1,5}$/;

const PREFIX_RE = new RegExp(
  `^(${[...APP_INPUT_PREFIXES]
    .sort((a, b) => b.length - a.length)
    .map(prefix => prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})(?=[-_.]|$)`,
  'i'
);

/** stampedUploadName's "-u<base36 ms>" (8 characters until the year 2059). */
const STAMPED_UPLOAD_RE = /-u[0-9a-z]{8}\.[A-Za-z0-9]{1,5}$/;
/** cutoutFilename (and the older "<photo>-cutout.png"). */
const CUTOUT_RE = /-cutout(-u[0-9a-z]{6,})?(-[0-9a-f]{16})?\.png$/i;

/**
 * The group an app-made input belongs to ("day-nude-face", "cut-out", "content-named", …), or
 * null for a file the app did not make — those are never listed.
 */
export function appInputCategory(name: string): string | null {
  const trimmed = name.trim();
  if (!PLAIN_NAME_RE.test(trimmed)) return null;
  const prefix = PREFIX_RE.exec(trimmed)?.[1];
  if (prefix) return prefix.toLowerCase();
  if (CUTOUT_RE.test(trimmed)) return 'cut-out';
  if (isContentAddressedInputName(trimmed)) return 'content-named';
  if (STAMPED_UPLOAD_RE.test(trimmed)) return 'stamped upload';
  return null;
}

export function isAppMadeInputName(name: string): boolean {
  return appInputCategory(name) !== null;
}

/**
 * Every filename-shaped token in `text` (saved JSON, URLs, workflow graphs). Splitting on
 * anything a plain name cannot contain finds "day-pose-guide-x1-….png" inside
 * "/api/comfyui/view?filename=day-pose-guide-x1-….png&type=input" and "sub/name.png".
 */
export function collectInputNameTokens(
  text: string,
  into: Set<string> = new Set(),
  keep: (token: string) => boolean = () => true
): Set<string> {
  for (const token of text.split(/[^A-Za-z0-9._-]+/)) {
    if (token.length < 5 || !PLAIN_NAME_RE.test(token)) continue;
    if (keep(token)) into.add(token);
  }
  return into;
}

export type InputFileInfo = {
  name: string;
  /** Bytes; unknown sizes count as 0. */
  size?: number;
  /** Last modified (ms since epoch); unknown means "too new to judge". */
  mtimeMs?: number;
};

export type UnreferencedInputs = {
  /** App-made, unreferenced and older than `minAgeMs` — what the command removes. */
  removable: InputFileInfo[];
  removableBytes: number;
  /** App-made and unreferenced but newer (or of unknown age) — kept this time. */
  tooNew: InputFileInfo[];
  /** App-made files something still names. */
  referencedCount: number;
  appMadeCount: number;
  appMadeBytes: number;
  /** Removable count and bytes per category. */
  byCategory: Array<{ category: string; count: number; bytes: number }>;
};

/** What /api/comfyui/input-folder answers (Settings → ComfyUI → Input folder). */
export type ComfyInputFolderReport = {
  inputDir: string | null;
  /** The app server can read the folder directly (same machine). */
  local: boolean;
  /** The app server could delete files there (it still does not). */
  writable: boolean;
  totalFiles: number;
  appMadeCount: number;
  appMadeBytes: number;
  referencedCount: number;
  removable: InputFileInfo[];
  removableBytes: number;
  tooNewCount: number;
  minAgeDays: number;
  byCategory: Array<{ category: string; count: number; bytes: number }>;
  command: string;
  sources: { browser: number; serverStorage: boolean; comfyQueue: boolean };
};

/** Split the input folder into what is safe to remove and what stays. */
export function findUnreferencedAppInputs(input: {
  files: readonly InputFileInfo[];
  referenced: ReadonlySet<string>;
  now: number;
  minAgeMs?: number;
}): UnreferencedInputs {
  const minAgeMs = input.minAgeMs ?? INPUT_CLEANUP_MIN_AGE_MS;
  const removable: InputFileInfo[] = [];
  const tooNew: InputFileInfo[] = [];
  const categories = new Map<string, { count: number; bytes: number }>();
  let referencedCount = 0;
  let appMadeCount = 0;
  let appMadeBytes = 0;
  let removableBytes = 0;
  const seen = new Set<string>();
  for (const file of input.files) {
    const name = file.name.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const category = appInputCategory(name);
    if (!category) continue;
    appMadeCount += 1;
    appMadeBytes += file.size ?? 0;
    if (input.referenced.has(name)) {
      referencedCount += 1;
      continue;
    }
    const old =
      typeof file.mtimeMs === 'number' &&
      Number.isFinite(file.mtimeMs) &&
      input.now - file.mtimeMs >= minAgeMs;
    if (!old) {
      tooNew.push(file);
      continue;
    }
    removable.push(file);
    removableBytes += file.size ?? 0;
    const group = categories.get(category) ?? { count: 0, bytes: 0 };
    group.count += 1;
    group.bytes += file.size ?? 0;
    categories.set(category, group);
  }
  return {
    removable,
    removableBytes,
    tooNew,
    referencedCount,
    appMadeCount,
    appMadeBytes,
    byCategory: [...categories.entries()]
      .map(([category, group]) => ({ category, ...group }))
      .sort((a, b) => b.bytes - a.bytes || a.category.localeCompare(b.category)),
  };
}

/** POSIX single-quote `value` for a shell. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * A command the player runs themselves: `rm --` with every file by its full path, a batch per
 * line so a long list stays readable and under the shell's argument limit. Only plain app-made
 * names get in — no "/", no "..", nothing the scan could not match.
 */
export function buildInputCleanupCommand(input: {
  inputDir: string | null;
  names: readonly string[];
  perLine?: number;
}): string {
  const names = input.names.filter(name => PLAIN_NAME_RE.test(name) && isAppMadeInputName(name));
  if (names.length === 0) return '';
  const perLine = Math.max(1, input.perLine ?? 25);
  const dir = (input.inputDir?.trim() || '/path/to/ComfyUI/input').replace(/\/+$/, '');
  const lines: string[] = [];
  for (let index = 0; index < names.length; index += perLine) {
    const batch = names.slice(index, index + perLine).map(name => shellQuote(`${dir}/${name}`));
    lines.push(`rm -- ${batch.join(' ')}`);
  }
  return lines.join('\n');
}

/** ComfyUI's `/internal/files/input` lists "name.png [input]"; keep top-level names only. */
export function parseComfyInputListing(payload: unknown): string[] {
  if (!Array.isArray(payload)) return [];
  const names: string[] = [];
  for (const raw of payload) {
    if (typeof raw !== 'string') continue;
    const name = raw.replace(/\s*\[input\]\s*$/, '').trim();
    if (name && !name.includes('/') && !name.includes('\\')) names.push(name);
  }
  return names;
}

/** ComfyUI's input folder from its `/system_stats` argv (`--input-directory`, else beside main.py). */
export function comfyInputDirFromArgv(argv: unknown): string | null {
  if (!Array.isArray(argv)) return null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (typeof arg !== 'string') continue;
    if (arg === '--input-directory' && typeof argv[index + 1] === 'string') {
      return (argv[index + 1] as string).trim() || null;
    }
    if (arg.startsWith('--input-directory=')) {
      return arg.slice('--input-directory='.length).trim() || null;
    }
  }
  // No flag: ComfyUI uses "input" beside main.py.
  const main = typeof argv[0] === 'string' ? argv[0].trim() : '';
  return /^\/.*\/main\.py$/.test(main) ? `${main.slice(0, -'/main.py'.length)}/input` : null;
}
