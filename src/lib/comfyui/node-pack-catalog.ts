/**
 * The custom-node packs the app leans on, as ComfyUI Manager names them, with the node types that
 * show they loaded and, where it is known, why one installs but does not load (pure). A pack can
 * be in `custom_nodes` and still be missing from `/object_info`: its import failed, nearly always
 * on a Python package ComfyUI's own Python lacks (FaceAnalysis and ReActor need InsightFace). The
 * Switching ComfyUI assistant tells "missing" from "installed, not loading" and says the fix.
 */

export type ComfyNodePackId = 'controlnetAux' | 'faceAnalysis' | 'reactor' | 'videoHelperSuite';

export type ComfyNodePack = {
  id: ComfyNodePackId;
  label: string;
  /** What the app uses it for, in a few words. */
  usedFor: string;
  /** Present in `/object_info` when the pack loaded. */
  nodeTypes: readonly string[];
  /** Folder / registry names ComfyUI Manager reports for it (lower case). */
  managerNames: readonly string[];
  /** The usual reason it installs but does not load. */
  missingPython?: 'insightface';
};

export const COMFY_NODE_PACKS: readonly ComfyNodePack[] = [
  {
    id: 'controlnetAux',
    label: 'ComfyUI ControlNet Aux (DWPose)',
    usedFor: 'pose maps and pose checks',
    nodeTypes: ['DWPreprocessor'],
    managerNames: ['comfyui_controlnet_aux', 'comfyui-controlnet-aux'],
  },
  {
    id: 'faceAnalysis',
    label: 'ComfyUI FaceAnalysis (InsightFace)',
    usedFor: 'face checks, auto-review and face finish',
    nodeTypes: ['FaceAnalysisModels', 'FaceEmbedDistance'],
    managerNames: ['comfyui_faceanalysis', 'comfyui-faceanalysis'],
    missingPython: 'insightface',
  },
  {
    id: 'reactor',
    label: 'ReActor (face restore)',
    usedFor: 'face restore on finished stills',
    nodeTypes: ['ReActorRestoreFace'],
    managerNames: ['comfyui-reactor', 'comfyui-reactor-node', 'comfyui_reactor'],
    missingPython: 'insightface',
  },
  {
    id: 'videoHelperSuite',
    label: 'Video Helper Suite',
    usedFor: 'loading and saving clips',
    nodeTypes: ['VHS_LoadVideo', 'VHS_VideoCombine'],
    managerNames: ['comfyui-videohelpersuite', 'comfyui_videohelpersuite'],
  },
];

/** The custom-node folders ComfyUI Manager reports as installed and enabled (lower case). */
export function managerInstalledNames(payload: unknown): Set<string> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const enabled = new Set<string>();
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const entry = (value ?? {}) as { enabled?: unknown; cnr_id?: unknown; aux_id?: unknown };
    if (entry.enabled === false) continue;
    for (const name of [key, entry.cnr_id, entry.aux_id]) {
      if (typeof name === 'string' && name) enabled.add(name.toLowerCase().split('/').pop()!);
    }
  }
  return enabled;
}

export type ComfyNodePackState = 'loaded' | 'not-loading' | 'missing' | 'unknown';

/**
 * Loaded when every node type is there; "not loading" when ComfyUI Manager says it is installed
 * but its nodes are not; missing when neither; unknown when the Manager could not be asked and
 * the nodes are absent (installed-but-broken and never installed look the same then).
 */
export function comfyNodePackState(
  pack: ComfyNodePack,
  nodeTypes: ReadonlySet<string>,
  installed: ReadonlySet<string> | null
): ComfyNodePackState {
  if (pack.nodeTypes.every(type => nodeTypes.has(type))) return 'loaded';
  if (!installed) return 'unknown';
  return pack.managerNames.some(name => installed.has(name)) ? 'not-loading' : 'missing';
}

/** The pip line that fixes a pack that installs but does not load, for this ComfyUI's Python. */
export function missingPythonFix(
  missing: ComfyNodePack['missingPython'],
  system?: { os?: string | null; embeddedPython?: boolean } | null
): { command: string; note: string } | null {
  return missing === 'insightface' ? insightFaceInstallCommand(system) : null;
}

/** InsightFace for ComfyUI's own Python (FaceAnalysis and ReActor import it). */
export function insightFaceInstallCommand(
  system?: {
    os?: string | null;
    embeddedPython?: boolean;
  } | null
): { command: string; note: string } {
  const windows = /^nt$|win/i.test(system?.os ?? '');
  if (system?.embeddedPython) {
    return {
      command: 'python_embeded\\python.exe -m pip install insightface onnxruntime',
      note: 'Run it in the ComfyUI_windows_portable folder, then restart ComfyUI. If insightface fails to build, install the prebuilt insightface wheel for your Python version (see the ComfyUI_FaceAnalysis README).',
    };
  }
  return {
    command: 'python -m pip install insightface onnxruntime',
    note: windows
      ? "Run it with the Python ComfyUI uses (its venv's python.exe), then restart ComfyUI. insightface needs the Visual C++ Build Tools, or a prebuilt wheel for your Python version (see the ComfyUI_FaceAnalysis README)."
      : 'Run it with the Python ComfyUI uses (e.g. ComfyUI/venv/bin/python), then restart ComfyUI. insightface builds from source on some systems and then needs a C++ compiler and the Python headers (build-essential / python3-dev).',
  };
}
