/**
 * Server-only: read the body pose out of a finished still with ComfyUI's DWPose preprocessor
 * (comfyui_controlnet_aux). Feeds the Day pose-match check and the pose library.
 *
 * Runs a three-node graph (LoadImage → DWPreprocessor → PreviewImage), polls history for the
 * preprocessor's `openpose_json` UI output, then deletes that history entry so pose checks
 * never show up as gallery items. Reports `available: false` (never throws) when the node pack
 * is not installed, so callers can quietly skip the check.
 */

import { getComfyUiBaseUrl } from '@/lib/comfyui-client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui-config';
import { deleteComfyUiHistoryItems } from '@/lib/comfyui-status';
import { parseOpenPoseJson, type PoseDetectResult } from '@/lib/pose-score';

export type { PoseDetectResult };

/** Preferred first: DWPose is far more reliable on rendered bodies than the old OpenPose net. */
const DETECTOR_NODES = ['DWPreprocessor', 'OpenposePreprocessor'] as const;

type NodeInputSpec = [unknown, Record<string, unknown>?];
type NodeInfo = { input?: { required?: Record<string, NodeInputSpec> } };

const detectorCache = new Map<string, { node: string; info: NodeInfo; at: number } | null>();
const DETECTOR_CACHE_MS = 5 * 60 * 1000;

async function resolveDetector(baseUrl: string): Promise<{ node: string; info: NodeInfo } | null> {
  const cached = detectorCache.get(baseUrl);
  if (cached !== undefined && (cached === null || Date.now() - cached.at < DETECTOR_CACHE_MS)) {
    return cached;
  }
  for (const node of DETECTOR_NODES) {
    try {
      const response = await fetch(`${baseUrl}/object_info/${node}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as Record<string, NodeInfo>;
      const info = payload[node];
      if (info?.input?.required) {
        const found = { node, info, at: Date.now() };
        detectorCache.set(baseUrl, found);
        return found;
      }
    } catch {
      // try the next detector
    }
  }
  detectorCache.set(baseUrl, null);
  return null;
}

/** Fill every required widget from object_info defaults, then pin body-only detection. */
export function buildDetectorInputs(
  info: NodeInfo,
  imageLink: [string, number]
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(info.input?.required ?? {})) {
    const [type, config] = spec ?? [];
    if (name === 'image') {
      inputs[name] = imageLink;
    } else if (config && 'default' in config) {
      inputs[name] = config.default;
    } else if (Array.isArray(type) && type.length > 0) {
      inputs[name] = type[0];
    }
  }
  const setIfPresent = (name: string, value: unknown) => {
    if (name in inputs) inputs[name] = value;
  };
  setIfPresent('detect_body', 'enable');
  setIfPresent('detect_hand', 'disable');
  setIfPresent('detect_face', 'disable');
  return inputs;
}

/** Pull filename / subfolder / type out of a `/api/comfyui/view?…` or Comfy `/view?…` URL. */
export function parseComfyViewRef(
  imageUrl: string
): { filename: string; subfolder: string; type: string } | null {
  try {
    const url = new URL(imageUrl, 'http://local');
    const filename = url.searchParams.get('filename')?.trim();
    if (!filename) return null;
    return {
      filename,
      subfolder: url.searchParams.get('subfolder')?.trim() ?? '',
      type: url.searchParams.get('type')?.trim() || 'output',
    };
  } catch {
    return null;
  }
}

async function stageStillAsInput(
  baseUrl: string,
  ref: { filename: string; subfolder: string; type: string }
): Promise<string> {
  if (ref.type === 'input') {
    return ref.subfolder ? `${ref.subfolder}/${ref.filename}` : ref.filename;
  }
  const params = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder,
    type: ref.type,
  });
  const view = await fetch(`${baseUrl}/view?${params.toString()}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!view.ok) {
    throw new Error(`Could not read the still from ComfyUI (HTTP ${view.status}).`);
  }
  const blob = await view.blob();
  const form = new FormData();
  form.append('image', blob, `pose-check-${ref.filename}`);
  form.append('overwrite', 'true');
  const upload = await fetch(`${baseUrl}/upload/image`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  if (!upload.ok) {
    throw new Error(`ComfyUI upload for pose check failed (HTTP ${upload.status}).`);
  }
  const data = (await upload.json()) as { name?: string; subfolder?: string };
  const name = data.name?.trim();
  if (!name) {
    throw new Error('ComfyUI upload for pose check returned no filename.');
  }
  return data.subfolder?.trim() ? `${data.subfolder.trim()}/${name}` : name;
}

type HistoryEntry = {
  outputs?: Record<string, { openpose_json?: unknown[] }>;
  status?: { status_str?: string; completed?: boolean; messages?: unknown[] };
};

export async function detectPoseInComfyStill(input: {
  imageUrl: string;
  comfyUrl?: string;
  timeoutMs?: number;
}): Promise<PoseDetectResult> {
  const ref = parseComfyViewRef(input.imageUrl);
  if (!ref) {
    return { available: false, reason: 'Still is not a ComfyUI image.' };
  }
  const baseUrl = getComfyUiBaseUrl(stripEmptyComfyUiRuntime({ apiUrl: input.comfyUrl })).replace(
    /\/+$/,
    ''
  );
  const detector = await resolveDetector(baseUrl);
  if (!detector) {
    return {
      available: false,
      reason: 'DWPose not installed in ComfyUI (comfyui_controlnet_aux).',
    };
  }
  const imageName = await stageStillAsInput(baseUrl, ref);
  const prompt = {
    '1': { class_type: 'LoadImage', inputs: { image: imageName } },
    '2': { class_type: detector.node, inputs: buildDetectorInputs(detector.info, ['1', 0]) },
    '3': { class_type: 'PreviewImage', inputs: { images: ['2', 0] } },
  };
  const queued = await fetch(`${baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Jump pending renders: a pose check is a few seconds of work and should not wait for them.
    body: JSON.stringify({ prompt, client_id: 'castcut-pose-check', front: true }),
    signal: AbortSignal.timeout(15000),
  });
  if (!queued.ok) {
    const text = await queued.text().catch(() => '');
    throw new Error(`Pose check queue failed (HTTP ${queued.status}) ${text.slice(0, 160)}`);
  }
  const { prompt_id: promptId } = (await queued.json()) as { prompt_id?: string };
  if (!promptId) {
    throw new Error('Pose check queue returned no prompt id.');
  }

  const deadline = Date.now() + (input.timeoutMs ?? 180_000);
  try {
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 800));
      const response = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as Record<string, HistoryEntry>;
      const entry = payload[promptId];
      if (!entry) continue;
      if (entry.status?.status_str === 'error') {
        throw new Error('DWPose failed in ComfyUI — check the ComfyUI log.');
      }
      const raw = entry.outputs?.['2']?.openpose_json?.[0];
      if (raw !== undefined) {
        const pose = parseOpenPoseJson(raw);
        if (!pose) {
          throw new Error('DWPose returned keypoints in an unknown format.');
        }
        return { available: true, pose };
      }
      if (entry.status?.completed) {
        return {
          available: false,
          reason: `${detector.node} ran but reported no keypoints (update comfyui_controlnet_aux).`,
        };
      }
    }
    throw new Error('Pose check timed out waiting for ComfyUI.');
  } finally {
    void deleteComfyUiHistoryItems(baseUrl, [promptId]);
  }
}
