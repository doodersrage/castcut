/**
 * Castcut nodes setup (Settings → ComfyUI → Castcut nodes), pure and shared by server and client:
 * which version ComfyUI has (object_info), what the app bundles, and the copy-paste install
 * commands for the ComfyUI machine (from /system_stats).
 */

import { CASTCUT_NODE_TYPES } from './castcut-nodes';

/** The pack this app ships (comfyui-nodes/castcut/castcut_nodes.py `CASTCUT_VERSION`). */
export const CASTCUT_NODES_BUNDLED_VERSION = '1.6.0';
export const CASTCUT_NODES_FILE_NAME = 'castcut_nodes.py';
/** The app serves its bundled copy here (src/app/api/castcut-nodes/file/route.ts). */
export const CASTCUT_NODES_FILE_ROUTE = '/api/castcut-nodes/file';
/** Comfy Registry id (comfyui-nodes/castcut/pyproject.toml `name`; published by doodersrage). */
export const CASTCUT_NODES_REGISTRY_ID = 'castcut-nodes';
/** Git install: the standalone pack repository. */
export const CASTCUT_NODES_GIT_URL = 'https://github.com/doodersrage/castcut-nodes';
export const CASTCUT_NODES_DOCS_URL =
  'https://github.com/doodersrage/castcut/blob/main/docs/castcut-nodes.md';

/** What the pack speeds up, for the card and the hints. */
export const CASTCUT_NODES_BENEFITS = [
  'Best of two for hard poses runs as one job: both takes share one model load, the pose check runs inside ComfyUI, the closer take is kept.',
  'Cut-outs (Isolate on white, plates) repair the matte and composite in the same job — no mask round trip.',
  'Face and pose checks answer straight away on the CPU instead of waiting for the render in progress (1.2.0+; pose and the Face finish probe 1.3.0+).',
  'Settings → ComfyUI → Input folder can delete unused uploads after you confirm, instead of handing you a command (1.3.0+).',
] as const;

/** One line for the card: which checks skip the render queue on this ComfyUI. */
export function describeCastcutHealth(
  health: {
    faceAnalysis: boolean;
    dwpose: boolean;
    vram?: { freeBytes: number; totalBytes: number };
  } | null
): string | null {
  if (!health) return null;
  const checks = [
    health.faceAnalysis ? 'face checks' : null,
    health.dwpose ? 'pose checks' : null,
  ].filter(Boolean);
  const vram = health.vram
    ? ` · GPU memory free: ${(health.vram.freeBytes / 1024 ** 3).toFixed(1)} of ${(health.vram.totalBytes / 1024 ** 3).toFixed(0)} GB`
    : '';
  return checks.length
    ? `Without the queue: ${checks.join(' and ')}${vram}.`
    : `No checks without the queue (ComfyUI_FaceAnalysis and comfyui_controlnet_aux are missing)${vram}.`;
}

export const CASTCUT_NODES_WITHOUT =
  'Without them everything still works: Best of two queues two jobs one after the other and the checks run as separate ComfyUI calls.';

const VERSION_MARKER = /\[castcut-nodes v?(\d+\.\d+\.\d+)\]/i;

/** The version in a node's object_info `description` ("… [castcut-nodes 1.1.0]"). */
export function parseCastcutNodesVersion(description: unknown): string | null {
  if (typeof description !== 'string') return null;
  return VERSION_MARKER.exec(description)?.[1] ?? null;
}

/** Semver-ish compare of "1.2.3" strings; missing parts count as 0. */
export function compareCastcutVersions(a: string, b: string): number {
  const left = a.split('.').map(part => Number.parseInt(part, 10) || 0);
  const right = b.split('.').map(part => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export type CastcutNodesState = 'missing' | 'partial' | 'outdated' | 'current' | 'newer';

export type CastcutNodesStatus = {
  state: CastcutNodesState;
  /** Null when missing, or installed before versions were reported (< 1.1.0). */
  installedVersion: string | null;
  bundledVersion: string;
  missingNodes: string[];
  /** One file in custom_nodes/ (`custom_nodes.castcut_nodes`) or a folder / clone. */
  installedAs: 'file' | 'folder' | null;
};

export type ObjectInfoNodeEntry = {
  description?: unknown;
  python_module?: unknown;
} | null;

/** Status from each pack node's object_info entry (null / absent = missing). */
export function castcutNodesStatusFromObjectInfo(
  nodes: Record<string, ObjectInfoNodeEntry | undefined>,
  bundledVersion: string = CASTCUT_NODES_BUNDLED_VERSION
): CastcutNodesStatus {
  const present = CASTCUT_NODE_TYPES.filter(type => nodes[type]);
  const missingNodes = CASTCUT_NODE_TYPES.filter(type => !nodes[type]);
  if (present.length === 0) {
    return {
      state: 'missing',
      installedVersion: null,
      bundledVersion,
      missingNodes,
      installedAs: null,
    };
  }
  const versions = present
    .map(type => parseCastcutNodesVersion(nodes[type]?.description))
    .filter((value): value is string => Boolean(value))
    .sort(compareCastcutVersions);
  const installedVersion = versions[0] ?? null;
  const pythonModule = present
    .map(type => nodes[type]?.python_module)
    .find((value): value is string => typeof value === 'string');
  const installedAs = pythonModule
    ? /^custom_nodes\.castcut_nodes$/.test(pythonModule)
      ? 'file'
      : 'folder'
    : null;
  const state: CastcutNodesState =
    missingNodes.length > 0
      ? 'partial'
      : !installedVersion
        ? 'outdated'
        : compareCastcutVersions(installedVersion, bundledVersion) < 0
          ? 'outdated'
          : compareCastcutVersions(installedVersion, bundledVersion) > 0
            ? 'newer'
            : 'current';
  return { state, installedVersion, bundledVersion, missingNodes, installedAs };
}

/** One line for the card's status. */
export function describeCastcutNodesStatus(status: CastcutNodesStatus): string {
  switch (status.state) {
    case 'missing':
      return 'Not installed on this ComfyUI.';
    case 'partial':
      return `Partly installed — missing ${status.missingNodes.join(', ')}. Install again to replace it.`;
    case 'outdated':
      return status.installedVersion
        ? `Installed v${status.installedVersion} — this app ships v${status.bundledVersion}. Update to get the newer checks.`
        : `Installed (an older version, before ${status.bundledVersion}) — this app ships v${status.bundledVersion}.`;
    case 'newer':
      return `Installed v${status.installedVersion} — newer than this app's v${status.bundledVersion}; fine to keep.`;
    default:
      return `Installed v${status.installedVersion} — up to date.`;
  }
}

export type CastcutNodesAction = 'none' | 'manager' | 'copy';

/**
 * The card's one primary action: nothing when up to date; ComfyUI-Manager when it is there
 * (unless the pack sits in custom_nodes/ as the single file — a Manager clone would load a second
 * copy beside it, so the file is replaced instead); the copy commands otherwise.
 */
export function chooseCastcutNodesAction(input: {
  status: CastcutNodesStatus | null;
  managerPresent: boolean;
  /** The Manager already refused (security level, Git URL off): fall back to the copy. */
  managerRefused?: boolean;
}): CastcutNodesAction {
  const state = input.status?.state;
  if (!state || state === 'current' || state === 'newer') return 'none';
  if (input.managerPresent && !input.managerRefused && input.status?.installedAs !== 'file') {
    return 'manager';
  }
  return 'copy';
}

/** Restarting ComfyUI kills the running render and the queue: only when it is empty. */
export function castcutRestartGate(queue: { running: number; pending: number } | null): {
  allowed: boolean;
  label: string;
} {
  const busy = queue ? queue.running + queue.pending : 0;
  if (busy > 0) {
    return { allowed: false, label: `Wait for ${busy} job${busy === 1 ? '' : 's'}` };
  }
  return { allowed: true, label: 'Restart ComfyUI…' };
}

export type ComfyUiSystemInfo = {
  os: string | null;
  comfyuiVersion: string | null;
  pythonVersion: string | null;
  embeddedPython: boolean;
  deployEnvironment: string | null;
  argv: string[];
};

/** The bits of ComfyUI's /system_stats the install commands need. */
export function parseComfyUiSystemStats(raw: unknown): ComfyUiSystemInfo | null {
  const system = (raw as { system?: Record<string, unknown> } | null)?.system;
  if (!system || typeof system !== 'object') return null;
  const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  return {
    os: str(system.os),
    comfyuiVersion: str(system.comfyui_version),
    pythonVersion: str(system.python_version)?.split(' ')[0] ?? null,
    embeddedPython: system.embedded_python === true,
    deployEnvironment: str(system.deploy_environment),
    argv: Array.isArray(system.argv)
      ? system.argv.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

export type ComfyUiLayout = {
  platform: 'windows' | 'mac' | 'linux';
  /** Windows portable build (python_embeded). */
  portable: boolean;
  /** Folder of main.py, when argv names it. */
  root: string | null;
  /** custom_nodes/ (from --base-directory or the root); null when unknown. */
  customNodesDir: string | null;
  /** ComfyUI's user/ folder (ComfyUI-Manager's config lives under it). */
  userDir: string | null;
  /** Installed under a system folder (/opt, /srv, /usr, /var): copy with sudo. */
  needsSudo: boolean;
  /** Looks like a container (`/app/main.py`, docker in deploy_environment). */
  container: boolean;
};

function argValue(argv: string[], flag: string): string | null {
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index] ?? '';
    if (item === flag) return argv[index + 1] ?? null;
    if (item.startsWith(`${flag}=`)) return item.slice(flag.length + 1);
  }
  return null;
}

function joinPath(base: string, part: string, windows: boolean): string {
  const sep = windows ? '\\' : '/';
  return `${base.replace(/[\\/]+$/, '')}${sep}${part}`;
}

function dirname(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return index > 0 ? path.slice(0, index) : index === 0 ? path.slice(0, 1) : '';
}

/** Where ComfyUI lives, from /system_stats (argv + os). */
export function inferComfyUiLayout(system: ComfyUiSystemInfo | null): ComfyUiLayout {
  const argv = system?.argv ?? [];
  const os = (system?.os ?? '').toLowerCase();
  const main = argv[0] ?? '';
  const windows =
    os === 'nt' ||
    os.startsWith('win') ||
    system?.embeddedPython === true ||
    /^[a-z]:\\/i.test(main);
  const platform: ComfyUiLayout['platform'] = windows
    ? 'windows'
    : os === 'darwin' || /^\/Users\//.test(main)
      ? 'mac'
      : 'linux';
  const portable = windows && (system?.embeddedPython === true || /python_embeded/i.test(main));
  const root = /main\.py$/i.test(main) ? dirname(main) || null : null;
  const baseDir = argValue(argv, '--base-directory');
  const home = baseDir || root;
  const customNodesDir = home ? joinPath(home, 'custom_nodes', windows) : null;
  const userDir =
    argValue(argv, '--user-directory') || (home ? joinPath(home, 'user', windows) : null);
  const container =
    /docker|container|kube/i.test(system?.deployEnvironment ?? '') || /^\/app\//.test(main);
  const needsSudo =
    platform === 'linux' && !container && /^\/(opt|srv|usr|var)\//.test(customNodesDir ?? '');
  return { platform, portable, root, customNodesDir, userDir, needsSudo, container };
}

export type CastcutInstallCommand = {
  id: 'curl' | 'wget' | 'powershell' | 'git' | 'comfy-cli' | 'docker';
  label: string;
  shell: 'bash' | 'powershell';
  command: string;
  note?: string;
  recommended?: boolean;
};

const API_KEY_PLACEHOLDER = '<API key>';

/**
 * Copy-paste install commands for the ComfyUI machine. `appOrigin` is this app as that machine
 * reaches it; `needsAuth` adds the Authorization header the app's API wants.
 */
export function buildCastcutInstallCommands(input: {
  system: ComfyUiSystemInfo | null;
  appOrigin: string;
  needsAuth?: boolean;
}): CastcutInstallCommand[] {
  const layout = inferComfyUiLayout(input.system);
  const fileUrl = `${input.appOrigin.replace(/\/+$/, '')}${CASTCUT_NODES_FILE_ROUTE}`;
  const windows = layout.platform === 'windows';
  const customNodes =
    layout.customNodesDir ??
    (layout.portable
      ? 'ComfyUI\\custom_nodes'
      : windows
        ? 'ComfyUI\\custom_nodes'
        : 'ComfyUI/custom_nodes');
  const dest = joinPath(customNodes, CASTCUT_NODES_FILE_NAME, windows);
  const restart = layout.needsSudo
    ? 'Then restart ComfyUI (a systemd service: sudo systemctl restart comfyui).'
    : layout.portable
      ? 'Then close ComfyUI and start it again (run_nvidia_gpu.bat).'
      : 'Then restart ComfyUI.';
  const where = layout.customNodesDir
    ? `Run on the ComfyUI machine. If it reaches this app under another address, change ${input.appOrigin}.`
    : `Run on the ComfyUI machine, with ${customNodes} changed to your ComfyUI's custom_nodes folder.`;
  const commands: CastcutInstallCommand[] = [];

  if (windows) {
    const headers = input.needsAuth
      ? ` -Headers @{ Authorization = "Bearer ${API_KEY_PLACEHOLDER}" }`
      : '';
    commands.push({
      id: 'powershell',
      label: layout.portable ? 'Windows portable (PowerShell)' : 'Windows (PowerShell)',
      shell: 'powershell',
      command: `Invoke-WebRequest -Uri "${fileUrl}"${headers} -OutFile "${dest}"`,
      note: `${layout.portable && !/^([a-z]:\\|\\\\)/i.test(customNodes) ? 'Run it in the ComfyUI_windows_portable folder (the one with run_nvidia_gpu.bat and python_embeded). ' : `${where} `}No packages to install — ComfyUI's Python (python_embeded on the portable build) already has numpy and Pillow. ${restart}`,
      recommended: true,
    });
    commands.push({
      id: 'curl',
      label: 'Windows (curl.exe)',
      shell: 'powershell',
      command: `curl.exe -fsSL${input.needsAuth ? ` -H "Authorization: Bearer ${API_KEY_PLACEHOLDER}"` : ''} "${fileUrl}" -o "${dest}"`,
      note: restart,
    });
  } else {
    const auth = input.needsAuth ? ` -H "Authorization: Bearer ${API_KEY_PLACEHOLDER}"` : '';
    const wgetAuth = input.needsAuth
      ? ` --header="Authorization: Bearer ${API_KEY_PLACEHOLDER}"`
      : '';
    const tmp = `/tmp/${CASTCUT_NODES_FILE_NAME}`;
    commands.push({
      id: 'curl',
      label: 'Copy the file (curl)',
      shell: 'bash',
      command: layout.needsSudo
        ? `curl -fsSL${auth} "${fileUrl}" -o ${tmp} \\\n  && sudo install -m 644 ${tmp} "${dest}"`
        : `curl -fsSL${auth} "${fileUrl}" -o "${dest}"`,
      note: `${where} ${restart}`,
      recommended: !layout.container,
    });
    commands.push({
      id: 'wget',
      label: 'Copy the file (wget)',
      shell: 'bash',
      command: layout.needsSudo
        ? `wget -q${wgetAuth} -O ${tmp} "${fileUrl}" \\\n  && sudo install -m 644 ${tmp} "${dest}"`
        : `wget -q${wgetAuth} -O "${dest}" "${fileUrl}"`,
      note: restart,
    });
  }

  commands.push({
    id: 'git',
    label: 'Clone with git',
    shell: windows ? 'powershell' : 'bash',
    command: `${layout.needsSudo ? 'sudo ' : ''}git clone ${CASTCUT_NODES_GIT_URL} "${joinPath(customNodes, 'castcut', windows)}"`,
    note: 'Clones the node pack repository. Update later with git pull. Use this or the file copy, not both.',
  });
  commands.push({
    id: 'comfy-cli',
    label: 'comfy-cli',
    shell: windows ? 'powershell' : 'bash',
    command: `comfy node install ${CASTCUT_NODES_REGISTRY_ID}`,
    note: `Installs ${CASTCUT_NODES_REGISTRY_ID} from the Comfy Registry.`,
  });
  const containerDir =
    layout.container && layout.customNodesDir ? layout.customNodesDir : '/app/custom_nodes';
  commands.push({
    id: 'docker',
    label: 'ComfyUI in Docker',
    shell: 'bash',
    command: `curl -fsSL${input.needsAuth ? ` -H "Authorization: Bearer ${API_KEY_PLACEHOLDER}"` : ''} "${fileUrl}" -o ${CASTCUT_NODES_FILE_NAME} \\\n  && docker cp ${CASTCUT_NODES_FILE_NAME} <container>:${containerDir}/${CASTCUT_NODES_FILE_NAME} \\\n  && docker restart <container>`,
    note: `Use your container's name and its custom_nodes path${layout.container ? '' : ' (often /app/custom_nodes or /root/ComfyUI/custom_nodes)'}. With custom_nodes on a mounted volume, copy into that folder on the host instead.`,
    recommended: layout.container,
  });
  return commands;
}

const USAGE_LABELS: Record<string, string> = {
  'analyze:face-distance': 'face match',
  'analyze:face-boxes': 'face finding',
  'analyze:face-probe': 'Face finish probe',
  'analyze:pose': 'pose',
  'analyze:person-poses': 'two-person pose',
  stage: 'still copies',
  'png-text': 'graph reads',
  'input-delete': 'input clean-ups',
};

/**
 * What the pack answered since ComfyUI started, and how often this app had to fall back to the
 * queue — the check that the routes are really used during a Day. Null before 1.3.0's usage.
 */
export function describeCastcutUsage(
  usage:
    | {
        routes: Record<string, { served: number; errors: number; avgMs: number }>;
      }
    | null
    | undefined,
  appFallbacks: Record<string, number> | null | undefined
): string | null {
  if (!usage) return null;
  const rows = Object.entries(usage.routes).filter(([, row]) => row.served + row.errors > 0);
  const served = rows.reduce((sum, [, row]) => sum + row.served, 0);
  const errors = rows.reduce((sum, [, row]) => sum + row.errors, 0);
  const fellBack = Object.values(appFallbacks ?? {}).reduce((sum, count) => sum + count, 0);
  const parts = rows
    .filter(([, row]) => row.served > 0)
    .sort((a, b) => b[1].served - a[1].served)
    .map(
      ([key, row]) => `${USAGE_LABELS[key] ?? key} ${row.served} (~${Math.round(row.avgMs)} ms)`
    );
  const head =
    served > 0
      ? `Since ComfyUI started: ${served} answered without the queue — ${parts.join(', ')}`
      : 'Since ComfyUI started: nothing asked of the pack yet';
  const tail = [
    errors > 0 ? `${errors} failed` : '',
    fellBack > 0 ? `this app fell back to the queue ${fellBack} times` : '',
  ].filter(Boolean);
  return `${head}${tail.length ? `; ${tail.join('; ')}` : ''}.`;
}
