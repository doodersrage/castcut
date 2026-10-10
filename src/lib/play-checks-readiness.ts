/**
 * Readiness of Play's optional checks and Cut extras, shared by server and client (pure).
 * The server fills it from ComfyUI object_info and the local ffmpeg; the UI renders it.
 */

export type PlayCheckReadiness = {
  ready: boolean;
  /** Short status for the UI ("DWPreprocessor", "missing FaceEmbedDistance"). */
  detail: string;
  /** What to install when not ready. */
  install?: { name: string; url: string };
  /** A command to run on the ComfyUI machine (the pack is there but does not load). */
  command?: string;
  /** One more line about the command (where to run it, what else it may need). */
  note?: string;
  /** LM Studio can download a vision model from here (vision-model-download-server.ts). */
  offerVisionDownload?: boolean;
};

export type PlayChecksReadiness = {
  /** False when ComfyUI could not be reached at all (the other fields are then unknown). */
  comfyReachable: boolean;
  pose: PlayCheckReadiness;
  face: PlayCheckReadiness;
  cutTitles: PlayCheckReadiness;
  /** Vision model for still review (Auto-review, Look tile roles); absent on older probes. */
  review?: PlayCheckReadiness;
  /**
   * The adult-appearance gate on adult Day / Story stills (adult-appearance-gate.ts). Always on;
   * with no vision model, adult stills are shown unchecked (the age wording still applies).
   */
  adultGate?: PlayCheckReadiness;
  /** The face pass on talking clips (ReActor + a CodeFormer / GFPGAN model); absent on older probes. */
  talkFace?: PlayCheckReadiness;
};

export const DWPOSE_PACK = {
  name: 'comfyui_controlnet_aux',
  url: 'https://github.com/Fannovel16/comfyui_controlnet_aux',
};

export const REACTOR_PACK = {
  name: 'ComfyUI-ReActor',
  url: 'https://github.com/Gourieff/ComfyUI-ReActor',
};

export const FACE_ANALYSIS_PACK = {
  name: 'ComfyUI_FaceAnalysis',
  url: 'https://github.com/cubiq/ComfyUI_FaceAnalysis',
};

/**
 * ComfyUI_FaceAnalysis refuses to load without InsightFace (or dlib): installed through the
 * Manager, the pack is there but its nodes never show up. The fix is the Python package, in the
 * Python ComfyUI runs on.
 */
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

/** Build readiness from which nodes ComfyUI reported and what ffmpeg can do. */
export function buildPlayChecksReadiness(input: {
  comfyReachable: boolean;
  poseNode: string | null;
  faceNodes: { models: boolean; distance: boolean; previewAny: boolean };
  ffmpeg: { available: boolean; drawtext: boolean; font: boolean };
  /** Which vision model still review will use, and where it came from. */
  vision?: {
    llmEnabled: boolean;
    model?: string;
    source?: 'session' | 'env' | 'detected';
    /** The LLM server is LM Studio, which can download a vision model for the player. */
    lmStudio?: boolean;
  };
  /** Packs ComfyUI-Manager lists as installed and enabled (null: no Manager to ask). */
  installedPacks?: { faceAnalysis: boolean; controlnetAux: boolean } | null;
  /** ComfyUI's /system_stats: which Python to name in a command. */
  system?: { os?: string | null; embeddedPython?: boolean } | null;
  /** ReActorRestoreFace and the restore models it lists (null: not probed). */
  faceRestore?: { node: boolean; models: string[] } | null;
}): PlayChecksReadiness {
  const { faceNodes, ffmpeg } = input;
  const faceMissing = [
    faceNodes.models ? null : 'FaceAnalysisModels',
    faceNodes.distance ? null : 'FaceEmbedDistance',
  ].filter((name): name is string => Boolean(name));
  const faceReady = input.comfyReachable && faceMissing.length === 0 && faceNodes.previewAny;
  const vision = input.vision;
  const review: PlayCheckReadiness | undefined = !vision
    ? undefined
    : !vision.llmEnabled
      ? { ready: false, detail: 'LLM is off (LLM_ENABLED)' }
      : vision.model
        ? {
            ready: true,
            detail:
              vision.source === 'detected'
                ? `${vision.model} (found on the LLM server)`
                : vision.source === 'session'
                  ? `${vision.model} (Settings → LLM)`
                  : `${vision.model} (LLM_VISION_MODEL)`,
          }
        : vision.lmStudio
          ? {
              ready: false,
              detail: 'no vision model in LM Studio — download one below',
              offerVisionDownload: true,
            }
          : {
              ready: false,
              detail: 'no vision model on the LLM server — pull one (e.g. qwen2.5vl or gemma3)',
            };
  const adultGate: PlayCheckReadiness | undefined = !vision
    ? undefined
    : review?.ready
      ? {
          ready: true,
          detail: `always on — every adult still is checked with ${vision.model} before it is shown`,
        }
      : {
          ready: false,
          detail:
            'no vision model — adult stills are shown unchecked; the adult age wording still applies',
        };
  const restore = input.faceRestore;
  const restoreModel = restore?.models.find(name => /codeformer|gfpgan/i.test(name));
  const talkFace: PlayCheckReadiness | undefined = !restore
    ? undefined
    : !input.comfyReachable
      ? { ready: false, detail: 'ComfyUI unreachable' }
      : !restore.node
        ? {
            ready: false,
            detail: 'not installed — talking clips can smear the mouth in some frames',
            install: REACTOR_PACK,
          }
        : restoreModel
          ? { ready: true, detail: `ReActor + ${restoreModel}` }
          : {
              ready: false,
              detail:
                'ReActor has no face restore model — download “CodeFormer face restore” under Settings → ComfyUI → Models',
            };
  return {
    ...(review ? { review } : {}),
    ...(talkFace ? { talkFace } : {}),
    ...(adultGate ? { adultGate } : {}),
    comfyReachable: input.comfyReachable,
    pose: input.poseNode
      ? { ready: true, detail: input.poseNode }
      : input.comfyReachable && input.installedPacks?.controlnetAux
        ? {
            ready: false,
            detail:
              'comfyui_controlnet_aux is installed but its nodes did not load — the ComfyUI log names the error (usually a missing Python package); fix it and restart ComfyUI',
          }
        : {
            ready: false,
            detail: input.comfyReachable ? 'DWPose not installed' : 'ComfyUI unreachable',
            ...(input.comfyReachable ? { install: DWPOSE_PACK } : {}),
          },
    face: faceReady
      ? { ready: true, detail: 'FaceAnalysis (InsightFace)' }
      : input.comfyReachable && faceMissing.length > 0 && input.installedPacks?.faceAnalysis
        ? {
            ready: false,
            detail:
              'ComfyUI_FaceAnalysis is installed but does not load — its InsightFace Python package is missing',
            ...insightFaceInstallCommand(input.system),
          }
        : {
            ready: false,
            detail: !input.comfyReachable
              ? 'ComfyUI unreachable'
              : faceMissing.length > 0
                ? `missing ${faceMissing.join(', ')}`
                : 'needs a newer ComfyUI (PreviewAny node)',
            ...(input.comfyReachable && faceMissing.length > 0
              ? { install: FACE_ANALYSIS_PACK }
              : {}),
          },
    cutTitles: !ffmpeg.available
      ? { ready: false, detail: 'no server ffmpeg — browser Cut draws titles instead' }
      : !ffmpeg.drawtext
        ? {
            ready: false,
            detail: 'server ffmpeg lacks drawtext — browser Cut draws titles instead',
          }
        : !ffmpeg.font
          ? { ready: false, detail: 'no font for titles — set FILM_FONT_FILE' }
          : { ready: true, detail: 'server ffmpeg + font' },
  };
}

/** One line for Day's Auto-review chip: what the review will and won't check. */
export function summarizePlayChecks(readiness: PlayChecksReadiness | null): string | null {
  if (!readiness) return null;
  if (!readiness.comfyReachable) return 'Pose / face checks: ComfyUI unreachable.';
  const on = [readiness.pose.ready ? 'pose' : null, readiness.face.ready ? 'face' : null].filter(
    Boolean
  );
  const off = [
    readiness.pose.ready ? null : `pose (${readiness.pose.install?.name ?? readiness.pose.detail})`,
    readiness.face.ready ? null : `face (${readiness.face.install?.name ?? readiness.face.detail})`,
  ].filter(Boolean);
  if (off.length === 0) return 'Pose and face checks ready.';
  return `${on.length ? `${on.join(' + ')} check ready; ` : ''}off: ${off.join(', ')} — install to enable.`;
}
