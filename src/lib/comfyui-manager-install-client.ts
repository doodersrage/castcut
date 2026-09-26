/**
 * Browser-side ComfyUI-Manager install. Never import the server installer here.
 */

import { fetchComfyObjectInfoCached } from './comfyui-object-info-cache';
import {
  collectMissingNodeTypesFromIssues,
  collectMissingWorkflowNodeTypes,
  extractMissingNodeTypesFromMessage,
} from './workflow-node-type-audit';

export type ManagerInstallClientResult = {
  ok: boolean;
  installed: string[];
  unresolved: string[];
  restartRequested: boolean;
  missingManager?: boolean;
  message: string;
};

const emptyInstall = (): ManagerInstallClientResult => ({
  ok: true,
  installed: [],
  unresolved: [],
  restartRequested: false,
  message: '',
});

/** Always seed these into Heal so Cast face lock works after first-run, not only when a workflow already references them. */
export const IDENTITY_HEAL_NODE_TYPES = [
  'IPAdapterModelLoader',
  'IPAdapterApply',
  'IPAdapterUnifiedLoader',
  'ApplyInstantID',
  'InstantIDModelLoader',
  'InstantIDFaceAnalysis',
] as const;

/** Seed Impact Pack FaceDetailer so Gallery → Face detail can auto-insert. */
export const FACE_DETAILER_HEAL_NODE_TYPES = [
  'FaceDetailer',
  'UltralyticsDetectorProvider',
] as const;

/**
 * Seed the Play checks' packs too: DWPose (comfyui_controlnet_aux) for the pose check and
 * FaceAnalysis for the face check — no workflow references them, so Heal never saw them missing.
 */
export const PLAY_CHECK_HEAL_NODE_TYPES = [
  'DWPreprocessor',
  'FaceAnalysisModels',
  'FaceEmbedDistance',
] as const;

/** Node type each Play-check row installs (Settings → Play checks "Install"). */
export const PLAY_CHECK_INSTALL_NODE_TYPES: Record<'pose' | 'face', string[]> = {
  pose: ['DWPreprocessor'],
  face: ['FaceAnalysisModels', 'FaceEmbedDistance'],
};

export async function requestComfyManagerInstall(input: {
  nodeTypes: string[];
  comfyUrl?: string;
  restart?: boolean;
}): Promise<ManagerInstallClientResult> {
  const nodeTypes = [...new Set(input.nodeTypes.map(type => type.trim()).filter(Boolean))];
  if (nodeTypes.length === 0) {
    return emptyInstall();
  }

  try {
    const response = await fetch('/api/comfyui/manager/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeTypes, comfyUrl: input.comfyUrl }),
    });
    const data = (await response.json().catch(() => null)) as {
      installed?: string[];
      unresolved?: string[];
      restartNeeded?: boolean;
      error?: string;
      missingManager?: boolean;
    } | null;
    const installed = data?.installed ?? [];
    const unresolved = data?.unresolved ?? nodeTypes;
    if (!response.ok) {
      return {
        ok: false,
        installed,
        unresolved,
        restartRequested: false,
        missingManager: data?.missingManager,
        message: data?.missingManager
          ? `Missing nodes: ${nodeTypes.join(', ')}. Install ComfyUI-Manager to auto-install packs.`
          : /security_level/i.test(data?.error ?? '')
            ? `${data?.error} ComfyUI-Manager security_level may be blocking installs.`
            : data?.error || `Could not install missing nodes: ${nodeTypes.join(', ')}.`,
      };
    }

    let restartRequested = false;
    let hostReady = true;
    if (input.restart !== false && data?.restartNeeded && installed.length > 0) {
      const { restartComfyUi } = await import('./comfyui-queue-control');
      const restart = await restartComfyUi(input.comfyUrl);
      restartRequested = restart.ok;
      if (restart.ok) {
        const { waitForComfyUiHostAfterRestart } = await import('./comfyui-host-ready');
        const ready = await waitForComfyUiHostAfterRestart(input.comfyUrl);
        hostReady = ready.ok;
      }
    }

    const securityHint = /security_level/i.test(data?.error ?? '')
      ? ' ComfyUI-Manager security_level may be blocking installs.'
      : '';
    const parts = [
      installed.length > 0 ? `Installed ${installed.join(', ')}.` : '',
      restartRequested
        ? hostReady
          ? 'ComfyUI is back after restart.'
          : 'ComfyUI restart requested; host did not answer in time.'
        : '',
      unresolved.length > 0 ? `Still missing: ${unresolved.join(', ')}.` : '',
    ].filter(Boolean);
    return {
      ok: true,
      installed,
      unresolved,
      restartRequested,
      message: `${parts.join(' ')}${securityHint}`.trim(),
    };
  } catch (error) {
    return {
      ok: false,
      installed: [],
      unresolved: nodeTypes,
      restartRequested: false,
      message: error instanceof Error ? error.message : 'Custom node install failed.',
    };
  }
}

export async function installMissingWorkflowNodePacks(
  comfyUrl?: string
): Promise<ManagerInstallClientResult> {
  try {
    const { loadComfyWorkflowFiles } = await import('./comfyui-workflow-files');
    const objectInfo = await fetchComfyObjectInfoCached({
      comfyUrl,
      forceRefresh: true,
    });
    if (!objectInfo?.nodeTypes || objectInfo.nodeTypes.size === 0) {
      const host = comfyUrl?.trim() || 'ComfyUI';
      return {
        ok: false,
        installed: [],
        unresolved: [],
        restartRequested: false,
        message: `Could not read object_info from ${host} — host may be down or still booting.`,
      };
    }
    const missing = collectMissingWorkflowNodeTypes(loadComfyWorkflowFiles(), objectInfo.nodeTypes);
    const identityMissing = IDENTITY_HEAL_NODE_TYPES.filter(
      type => !objectInfo.nodeTypes!.has(type)
    );
    const faceDetailerMissing = FACE_DETAILER_HEAL_NODE_TYPES.filter(
      type => !objectInfo.nodeTypes!.has(type)
    );
    const playCheckMissing = PLAY_CHECK_HEAL_NODE_TYPES.filter(
      type => !objectInfo.nodeTypes!.has(type)
    );
    const toInstall = [
      ...new Set([...missing, ...identityMissing, ...faceDetailerMissing, ...playCheckMissing]),
    ];
    if (toInstall.length === 0) {
      return emptyInstall();
    }
    return requestComfyManagerInstall({ nodeTypes: toInstall, comfyUrl, restart: true });
  } catch (error) {
    const host = comfyUrl?.trim() || 'ComfyUI';
    return {
      ok: false,
      installed: [],
      unresolved: [],
      restartRequested: false,
      message:
        error instanceof Error
          ? `Could not heal ${host}: ${error.message}`
          : `Could not heal ${host} — host may be unreachable.`,
    };
  }
}

export async function resolveMissingNodeTypesForJob(entry: {
  id?: string;
  workflowJson?: string;
  statusMessage?: string;
  comfyUrl?: string;
}): Promise<string[]> {
  const fromMessage = extractMissingNodeTypesFromMessage(entry.statusMessage ?? '');
  let workflowJson = entry.workflowJson?.trim() || '';
  if (!workflowJson && entry.id) {
    try {
      const { getGalleryEntryById } = await import('./gallery-db-store');
      workflowJson = getGalleryEntryById(entry.id)?.workflowJson?.trim() || '';
    } catch {
      workflowJson = '';
    }
  }
  if (!workflowJson) {
    return fromMessage;
  }
  const objectInfo = await fetchComfyObjectInfoCached({ comfyUrl: entry.comfyUrl });
  if (objectInfo?.nodeTypes && objectInfo.nodeTypes.size > 0) {
    const missing = collectMissingWorkflowNodeTypes([{ workflowJson }], objectInfo.nodeTypes);
    return [...new Set([...missing, ...fromMessage])];
  }
  return fromMessage;
}

export async function tryInstallMissingNodesFromIssues(input: {
  issues: Array<{ message?: string; classType?: string }>;
  comfyUrl?: string;
}): Promise<ManagerInstallClientResult | null> {
  const nodeTypes = collectMissingNodeTypesFromIssues(input.issues);
  if (nodeTypes.length === 0) {
    return null;
  }
  return requestComfyManagerInstall({
    nodeTypes,
    comfyUrl: input.comfyUrl,
    restart: true,
  });
}

export async function listHealComfyUrls(
  primary?: string,
  knownPoolUrls?: string[]
): Promise<string[]> {
  const { collectComfyPoolUrls } = await import('./comfyui-host-ready');
  const { loadComfyUiSettings } = await import('./comfyui-settings');
  const { loadSettingsCache } = await import('./settings-cache');
  const settings = loadComfyUiSettings();
  const extras = loadSettingsCache().shared.comfyPoolUrls ?? [];
  const fromHealth = knownPoolUrls
    ? knownPoolUrls
    : await (await import('./oom-retry')).fetchComfyUiPoolUrlsForRetry();
  return collectComfyPoolUrls({
    primary,
    settingsUrl: settings.apiUrl,
    extras,
    healthUrls: fromHealth,
  });
}
