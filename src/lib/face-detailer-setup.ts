/**
 * One-click FaceDetailer setup: pin a library workflow and (when needed)
 * install ComfyUI Impact Pack via Manager so Gallery → Face detail works.
 */

import { upsertComfyWorkflowFile } from './comfyui-workflow-files';
import { loadSettingsCache, saveSharedSettings } from './settings-cache';
import { buildFaceDetailerWorkflowScaffold } from './workflow-scaffold';
import {
  buildAutoFaceDetailerWorkflow,
  canAutoInsertFaceDetailer,
} from './facedetailer-workflow-patch';
import { findLibraryFaceDetailerWorkflow } from './workflow-library-face-detailer';
import { getFaceDetailerHealth, type FaceDetailerHealth } from './face-detailer-health';
import { fetchComfyObjectInfoCached } from './comfyui-object-info-cache';
import {
  FACE_DETAILER_HEAL_NODE_TYPES,
  requestComfyManagerInstall,
} from './comfyui-manager-install-client';
import { loadComfyUiSettings } from './comfyui-settings';

export { FACE_DETAILER_HEAL_NODE_TYPES };

export type FaceDetailerLibraryPinResult = {
  ok: boolean;
  created: boolean;
  workflowId?: string;
  workflowName?: string;
  usedAutoGraph: boolean;
  message: string;
  health: FaceDetailerHealth;
};

export type FaceDetailerSetupResult = FaceDetailerLibraryPinResult & {
  impactInstalled: boolean;
  restartRequested: boolean;
};

function pinFaceDetailerId(workflowId: string): void {
  const shared = loadSettingsCache().shared;
  saveSharedSettings({
    ...shared,
    modelWorkflowMap: {
      ...(shared.modelWorkflowMap ?? {}),
      faceDetailer: workflowId,
    },
  });
}

/**
 * Ensure a face-detailer workflow exists in the library and is pinned.
 * Prefers a real Impact Pack auto-graph when FaceDetailer is in object_info;
 * otherwise pins the portable scaffold (still enough for health + token path).
 */
export function ensureFaceDetailerLibraryPin(input?: {
  availableNodeTypes?: Iterable<string> | null;
  model?: string;
}): FaceDetailerLibraryPinResult {
  const existing = findLibraryFaceDetailerWorkflow();
  const healthBefore = getFaceDetailerHealth();
  if (existing && healthBefore.status === 'ready') {
    return {
      ok: true,
      created: false,
      workflowId: existing.id,
      workflowName: existing.name,
      usedAutoGraph: /FaceDetailer/i.test(existing.workflowJson),
      message: `FaceDetailer already pinned (${existing.name}).`,
      health: healthBefore,
    };
  }

  if (
    existing &&
    healthBefore.status === 'partial' &&
    !canAutoInsertFaceDetailer(input?.availableNodeTypes)
  ) {
    return {
      ok: false,
      created: false,
      workflowId: existing.id,
      workflowName: existing.name,
      usedAutoGraph: false,
      message: `FaceDetailer scaffold already pinned (${existing.name}). Install ComfyUI Impact Pack (Manager may be blocked by security_level), restart Comfy, then Soft Refresh and Set up again.`,
      health: healthBefore,
    };
  }

  // Upgrade scaffold → Impact auto-graph when nodes just became available.
  if (
    existing &&
    healthBefore.status === 'partial' &&
    canAutoInsertFaceDetailer(input?.availableNodeTypes)
  ) {
    const auto = buildAutoFaceDetailerWorkflow({
      availableNodeTypes: input?.availableNodeTypes,
      model: input?.model,
    });
    if (auto.inserted) {
      const saved = upsertComfyWorkflowFile({
        name: 'FaceDetailer (auto)',
        workflowJson: JSON.stringify(auto.workflow, null, 2),
        id: existing.id,
      });
      pinFaceDetailerId(saved.id);
      const health = getFaceDetailerHealth();
      return {
        ok: health.status === 'ready',
        created: false,
        workflowId: saved.id,
        workflowName: saved.name,
        usedAutoGraph: true,
        message: `Upgraded FaceDetailer scaffold to Impact Pack graph (${saved.name}).`,
        health,
      };
    }
  }

  if (existing && healthBefore.status !== 'ready') {
    pinFaceDetailerId(existing.id);
    const health = getFaceDetailerHealth();
    return {
      ok: health.status === 'ready',
      created: false,
      workflowId: existing.id,
      workflowName: existing.name,
      usedAutoGraph: /FaceDetailer/i.test(existing.workflowJson),
      message: `Pinned existing FaceDetailer workflow (${existing.name}).`,
      health,
    };
  }

  const canAuto = canAutoInsertFaceDetailer(input?.availableNodeTypes);
  let workflowJson: string;
  let name: string;
  let usedAutoGraph = false;
  if (canAuto) {
    const auto = buildAutoFaceDetailerWorkflow({
      availableNodeTypes: input?.availableNodeTypes,
      model: input?.model,
    });
    if (auto.inserted) {
      workflowJson = JSON.stringify(auto.workflow, null, 2);
      name = 'FaceDetailer (auto)';
      usedAutoGraph = true;
    } else {
      const scaffold = buildFaceDetailerWorkflowScaffold();
      workflowJson = scaffold.json;
      name = 'FaceDetailer scaffold';
    }
  } else {
    const scaffold = buildFaceDetailerWorkflowScaffold();
    workflowJson = scaffold.json;
    name = 'FaceDetailer scaffold';
  }

  const saved = upsertComfyWorkflowFile({
    name,
    workflowJson,
  });
  pinFaceDetailerId(saved.id);
  const health = getFaceDetailerHealth();
  return {
    ok: health.status === 'ready',
    created: true,
    workflowId: saved.id,
    workflowName: saved.name,
    usedAutoGraph,
    message: usedAutoGraph
      ? `Created and pinned Impact Pack FaceDetailer workflow (${saved.name}).`
      : `Created and pinned FaceDetailer scaffold (${saved.name}). Not fully ready — install ComfyUI Impact Pack, restart Comfy, Soft Refresh, then Set up again.`,
    health,
  };
}

/**
 * Full setup: install Impact Pack when missing, then pin an auto FaceDetailer
 * (or scaffold) workflow for Gallery → Face detail.
 */
export async function ensureFaceDetailerSetup(input?: {
  comfyUrl?: string;
  model?: string;
}): Promise<FaceDetailerSetupResult> {
  const comfyUrl = input?.comfyUrl?.trim() || loadComfyUiSettings().apiUrl?.trim() || undefined;
  let impactInstalled = false;
  let restartRequested = false;
  let installNote = '';

  const objectInfo = await fetchComfyObjectInfoCached({
    comfyUrl,
    forceRefresh: true,
  });
  const nodeTypes = objectInfo?.nodeTypes;
  const missingImpact = FACE_DETAILER_HEAL_NODE_TYPES.filter(type => !nodeTypes?.has(type));

  if (missingImpact.length > 0) {
    const install = await requestComfyManagerInstall({
      nodeTypes: [...missingImpact],
      comfyUrl,
      restart: true,
    });
    impactInstalled = install.installed.length > 0;
    restartRequested = install.restartRequested;
    installNote = install.message;
    if (!install.ok && !impactInstalled) {
      const pin = ensureFaceDetailerLibraryPin({
        availableNodeTypes: nodeTypes,
        model: input?.model,
      });
      return {
        ...pin,
        impactInstalled: false,
        restartRequested: false,
        message: [install.message || 'Could not install Impact Pack.', pin.message]
          .filter(Boolean)
          .join(' '),
      };
    }
  }

  const refreshed = await fetchComfyObjectInfoCached({
    comfyUrl,
    forceRefresh: true,
  });
  const pin = ensureFaceDetailerLibraryPin({
    availableNodeTypes: refreshed?.nodeTypes ?? nodeTypes,
    model: input?.model ?? loadSettingsCache().shared.model,
  });

  return {
    ...pin,
    impactInstalled,
    restartRequested,
    message: [installNote, pin.message].filter(Boolean).join(' '),
  };
}
