/**
 * Which ComfyUI install answers at a URL, from its own `/system_stats` (pure): its version and
 * kind (desktop app, portable, plain), and the folders it really uses — inputs, outputs, models —
 * from its start-up arguments (`--input-directory`, `--output-directory`, `--base-directory`,
 * `--extra-model-paths-config`) and the model-paths file the desktop app writes. Switching to a
 * new install moved all three under the app's feet: pictures, model downloads (COMFYUI_ROOT still
 * named the old install) and node packs (user report 2026-10-24). The Switching ComfyUI assistant
 * (Settings → ComfyUI) is built on this.
 */

export type ComfyInstallInfo = {
  version?: string;
  /** `local-desktop2-standalone`, `local-portable`… as ComfyUI reports it. */
  deploy?: string;
  os?: string;
  python?: string;
  embeddedPython?: boolean;
  /** main.py as ComfyUI was started (may be relative to its working folder). */
  mainPath?: string;
  /** `--base-directory`: inputs, outputs and models live under it unless named apart. */
  baseDir?: string;
  inputDir?: string;
  outputDir?: string;
  /** `--extra-model-paths-config` files, in order. */
  modelPathFiles: string[];
  gpu?: string;
};

function argValue(argv: readonly string[], flag: string): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === flag && typeof argv[i + 1] === 'string') return argv[i + 1]!.trim() || undefined;
    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1).trim() || undefined;
  }
  return undefined;
}

function argValues(argv: readonly string[], flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === flag) {
      // nargs='+': every value up to the next flag.
      for (let j = i + 1; j < argv.length && !argv[j]!.startsWith('--'); j += 1) {
        if (argv[j]!.trim()) out.push(argv[j]!.trim());
      }
    } else if (arg.startsWith(`${flag}=`)) {
      out.push(arg.slice(flag.length + 1).trim());
    }
  }
  return out.filter(Boolean);
}

const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/** ComfyUI's `/system_stats` answer, read; null when it is not one. */
export function parseComfyInstallInfo(stats: unknown): ComfyInstallInfo | null {
  const system = (stats as { system?: Record<string, unknown> } | null)?.system;
  if (!system || typeof system !== 'object') return null;
  const argv = Array.isArray(system.argv)
    ? system.argv.filter((arg): arg is string => typeof arg === 'string')
    : [];
  const devices = (stats as { devices?: Array<{ name?: unknown }> }).devices;
  const mainPath = argv.find(arg => /(^|[\\/])main\.py$/i.test(arg));
  return {
    version: text(system.comfyui_version),
    deploy: text(system.deploy_environment),
    os: text(system.os),
    python: text(system.python_version)?.split(' ')[0],
    embeddedPython: system.embedded_python === true,
    ...(mainPath ? { mainPath } : {}),
    ...(argValue(argv, '--base-directory') ? { baseDir: argValue(argv, '--base-directory') } : {}),
    ...(argValue(argv, '--input-directory')
      ? { inputDir: argValue(argv, '--input-directory') }
      : {}),
    ...(argValue(argv, '--output-directory')
      ? { outputDir: argValue(argv, '--output-directory') }
      : {}),
    modelPathFiles: argValues(argv, '--extra-model-paths-config'),
    ...(Array.isArray(devices) && text(devices[0]?.name)
      ? {
          // "cuda:0 NVIDIA GeForce RTX 4090 : cudaMallocAsync" → the card's name.
          gpu: text(devices[0]?.name)!
            .replace(/^[a-z]+:\d+\s+/i, '')
            .replace(/\s+:\s+\S+$/, ''),
        }
      : {}),
  };
}

/** Where a folder is when ComfyUI was not told: beside main.py (or under --base-directory). */
function besideMain(
  info: ComfyInstallInfo,
  name: 'input' | 'output' | 'models'
): string | undefined {
  const base = info.baseDir ?? (info.mainPath ? dirnameOf(info.mainPath) : undefined);
  // A relative main.py ("ComfyUI/main.py", the desktop app) says nothing about where it ran.
  if (!base || !isAbsolutePath(base)) return undefined;
  return joinPath(base, name);
}

export function comfyInputDir(info: ComfyInstallInfo): string | undefined {
  return info.inputDir ?? besideMain(info, 'input');
}

export function comfyOutputDir(info: ComfyInstallInfo): string | undefined {
  return info.outputDir ?? besideMain(info, 'output');
}

/**
 * The models folder an extra-model-paths file makes the default (the desktop app's is
 * `base_path: …/models` with `checkpoints: checkpoints/`; ComfyUI's example is `base_path: …/ComfyUI`
 * with `checkpoints: models/checkpoints/`). Only the entry marked `is_default`, else the first.
 */
export function modelsDirFromModelPaths(yaml: string): string | undefined {
  type Entry = { base?: string; isDefault: boolean; checkpoints?: string };
  const entries: Entry[] = [];
  let current: Entry | null = null;
  for (const raw of yaml.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\S[^:]*:\s*$/.test(line)) {
      current = { isDefault: false };
      entries.push(current);
      continue;
    }
    if (!current) continue;
    const match = line.match(/^\s+['"]?([A-Za-z_][\w.-]*)['"]?\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1]!;
    const value = match[2]!.trim().replace(/^['"]|['"]$/g, '');
    if (key === 'base_path') current.base = value;
    else if (key === 'is_default') current.isDefault = /^true$/i.test(value);
    else if (key === 'checkpoints' && value && value !== '|-' && value !== '|')
      current.checkpoints = value;
  }
  const entry = entries.find(e => e.isDefault && e.base) ?? entries.find(e => e.base);
  if (!entry?.base) return undefined;
  const base = entry.base.replace(/[\\/]+$/, '');
  const checkpoints = (entry.checkpoints ?? 'checkpoints/').replace(/\\/g, '/');
  // "models/checkpoints/" under the base: the models folder is base/models.
  const firstPart = checkpoints.split('/')[0];
  return firstPart && firstPart !== 'checkpoints' ? joinPath(base, firstPart) : base;
}

/**
 * The install folder model downloads write under: `<root>/models/<kind>` (comfy-asset-paths.ts),
 * so the folder that holds the models folder — or none when it is not called "models".
 */
export function comfyRootForModelsDir(modelsDir: string | undefined): string | undefined {
  if (!modelsDir) return undefined;
  const clean = modelsDir.replace(/[\\/]+$/, '');
  const name = clean.split(/[\\/]/).pop();
  return name?.toLowerCase() === 'models' ? dirnameOf(clean) : undefined;
}

/**
 * What tells this install from another: the folders it uses and where it runs from. A version
 * update keeps the identity (the same install, upgraded); a new install changes it.
 */
export function comfyInstallIdentity(info: ComfyInstallInfo, modelsDir?: string): string {
  return [
    info.deploy ?? '',
    info.mainPath ?? '',
    info.baseDir ?? '',
    comfyInputDir(info) ?? '',
    comfyOutputDir(info) ?? '',
    modelsDir ?? info.modelPathFiles.join('|'),
  ]
    .map(part => part.replace(/\\/g, '/').replace(/\/+$/, ''))
    .join('\n');
}

/** "Desktop app", "Portable", "Docker"… for the deploy string ComfyUI reports. */
export function comfyDeployLabel(deploy: string | undefined): string {
  const d = deploy?.toLowerCase() ?? '';
  if (d.includes('desktop')) return 'ComfyUI Desktop';
  if (d.includes('portable')) return 'ComfyUI Portable';
  if (d.includes('docker') || d.includes('container')) return 'ComfyUI in Docker';
  if (d.includes('cloud')) return 'ComfyUI (cloud)';
  return 'ComfyUI';
}

function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\');
}

function dirnameOf(p: string): string {
  const clean = p.replace(/[\\/]+$/, '');
  const at = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
  return at > 0 ? clean.slice(0, at) : at === 0 ? clean.slice(0, 1) : '.';
}

function joinPath(base: string, name: string): string {
  const sep = base.includes('\\') && !base.includes('/') ? '\\' : '/';
  return `${base.replace(/[\\/]+$/, '')}${sep}${name}`;
}
