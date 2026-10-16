import { loadEngineSettings } from './engine-settings';
import { loadSettingsCache } from './settings-cache';
import type { EngineId } from './engine/types';
import type { ServerEnvSummary } from './server-env-summary';

type HealthPayload = {
  comfyui?: { ok?: boolean };
  serverEnv?: ServerEnvSummary;
};

export type VideoStillHandoffEngine = 'fal' | 'replicate';

function envKeyConfigured(summary: ServerEnvSummary | undefined, keys: string[]): boolean {
  if (!summary?.groups) {
    return false;
  }
  return summary.groups.some(group =>
    group.fields.some(field => keys.includes(field.key) && field.configured)
  );
}

export function resolveVideoStillHandoffEngine(input: {
  engine: EngineId;
  comfyOk?: boolean;
  falReady: boolean;
  replicateReady: boolean;
}): VideoStillHandoffEngine | null {
  if (input.engine === 'fal') {
    return 'fal';
  }
  if (input.engine === 'replicate') {
    return 'replicate';
  }
  if (input.engine !== 'comfyui') {
    return null;
  }
  if (input.comfyOk === true) {
    return null;
  }
  if (input.falReady) {
    return 'fal';
  }
  if (input.replicateReady) {
    return 'replicate';
  }
  return null;
}

/**
 * When handing a still to Video and local Comfy is down, prefer a cloud clip
 * engine the user already has a key for (Fal first, then Replicate).
 */
export async function preferCloudForVideoStillHandoff(): Promise<VideoStillHandoffEngine | null> {
  const engine = loadEngineSettings().engine;
  const shared = loadSettingsCache().shared;
  const sessionFal = Boolean(shared.sessionFalApiKey?.trim());
  const sessionReplicate = Boolean(shared.sessionReplicateApiToken?.trim());
  try {
    const response = await fetch('/api/health', { signal: AbortSignal.timeout(2500) });
    const data = (await response.json()) as HealthPayload;
    const falReady = sessionFal || envKeyConfigured(data.serverEnv, ['FAL_KEY', 'FAL_API_KEY']);
    const replicateReady =
      sessionReplicate ||
      envKeyConfigured(data.serverEnv, ['REPLICATE_API_TOKEN', 'REPLICATE_API_KEY']);
    return resolveVideoStillHandoffEngine({
      engine,
      comfyOk: data.comfyui?.ok === true,
      falReady,
      replicateReady,
    });
  } catch {
    return resolveVideoStillHandoffEngine({
      engine,
      comfyOk: false,
      falReady: sessionFal,
      replicateReady: sessionReplicate,
    });
  }
}
