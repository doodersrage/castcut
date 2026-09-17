/**
 * Character LoRA flywheel — train / register / prove from Cast, not Settings.
 */

import {
  applyCharacterRecord,
  castLoraSessionIds,
  loraTriggerFromCharacter,
  pinLoraOnCharacter,
  setCharacterTrigger,
  type CharacterRecord,
} from './character-os';
import { loadComfyUiSettings, saveComfyUiSettings } from './comfyui-settings';
import {
  buildLoraTrainValidationPrompt,
  createTrainJob,
  normalizeLoraTrainTrainerPrefs,
  normalizeTrainJobs,
  registerTrainJobLora,
  upsertTrainJob,
  type TrainJob,
} from './lora-train-job';
import { castFaceQueueParamsBase, syncSharedIdentityToCast } from './look-outfit-plate';
import { loadSettingsCache, saveSharedSettings } from './settings-cache';

export function mergeTrainJobs(local: TrainJob[], remote: TrainJob[]): TrainJob[] {
  let next = normalizeTrainJobs(local);
  for (const job of remote) {
    next = upsertTrainJob(next, job);
  }
  return next;
}

export function persistTrainJobs(jobs: TrainJob[]): TrainJob[] {
  const next = normalizeTrainJobs(jobs);
  saveSharedSettings({
    ...loadSettingsCache().shared,
    loraTrainJobs: next,
  });
  return next;
}

export function trainJobsForCharacter(jobs: TrainJob[], characterId: string): TrainJob[] {
  const id = characterId.trim();
  if (!id) {
    return [];
  }
  return normalizeTrainJobs(jobs).filter(job => job.characterId === id);
}

export function suggestedLoraOutputPath(character: CharacterRecord, lookName?: string): string {
  const who =
    character.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'character';
  const look =
    lookName
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'look';
  return `${who}-${look}-v1.safetensors`;
}

/** Face + LoRA pins Prove-it should pass into resolveQueueParams / runtime. */
export function characterLookValidationQueuePins(
  character: CharacterRecord,
  strength?: number
): {
  faceBase: ReturnType<typeof castFaceQueueParamsBase>;
  sessionActiveLoraIds: ReturnType<typeof castLoraSessionIds>;
} {
  return {
    faceBase: castFaceQueueParamsBase(character, strength),
    sessionActiveLoraIds: castLoraSessionIds(character),
  };
}

export async function startCharacterLookTrain(input: {
  character: CharacterRecord;
  lookId?: string;
  lookName?: string;
  trigger: string;
  /** Absolute on-disk dataset from persistLoraDatasetOnServer. */
  datasetPath?: string;
}): Promise<{ job: TrainJob; jobs: TrainJob[]; message: string }> {
  const trigger = input.trigger.trim() || loraTriggerFromCharacter(input.character) || '';
  if (!trigger) {
    throw new Error('Save a trigger word before training this look.');
  }
  const prefs = normalizeLoraTrainTrainerPrefs(loadSettingsCache().shared.loraTrainTrainerPrefs);
  const outputPath =
    prefs.outputDir?.trim() || suggestedLoraOutputPath(input.character, input.lookName);
  const datasetPath = input.datasetPath?.trim() || prefs.datasetPath?.trim() || undefined;

  if (datasetPath) {
    saveSharedSettings({
      ...loadSettingsCache().shared,
      loraTrainTrainerPrefs: { ...prefs, datasetPath },
    });
  }

  const response = await fetch('/api/lora-train', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'start',
      trigger,
      outputPath,
      datasetPath,
      baseModel: prefs.baseModel?.trim() || undefined,
      trainerUrl: prefs.trainerUrl?.trim() || undefined,
      trainerCommand: prefs.trainerCommand?.trim() || undefined,
      templateId: prefs.templateId?.trim() || undefined,
      kohyaScript: prefs.kohyaScript?.trim() || undefined,
      networkRank: prefs.networkRank,
      maxTrainSteps: prefs.maxTrainSteps,
      resolution: prefs.resolution,
      characterId: input.character.id,
      lookId: input.lookId,
    }),
  });
  const data = (await response.json()) as {
    error?: string;
    job?: TrainJob;
    jobs?: TrainJob[];
  };
  if (!response.ok) {
    throw new Error(data.error || 'Failed to start train job.');
  }

  const job =
    data.job ??
    createTrainJob({
      trigger,
      outputPath,
      status: 'manual',
      characterId: input.character.id,
      lookId: input.lookId,
      datasetPath,
    });
  const local = normalizeTrainJobs(loadSettingsCache().shared.loraTrainJobs);
  const jobs = persistTrainJobs(mergeTrainJobs(local, data.jobs ?? [job]));
  const message =
    job.status === 'manual'
      ? `Manual train job recorded for ${input.character.name}. Register when the weight is ready.`
      : `Train job ${job.id} started (${job.status})${datasetPath ? ' with exported keepers' : ''}.`;
  return { job, jobs, message };
}

/**
 * Export keepers to PROMPT_DATA_DIR and start train with datasetPath.
 */
export async function exportKeepersAndTrain(input: {
  character: CharacterRecord;
  lookId?: string;
  lookName?: string;
  trigger: string;
  keepers: import('./comfyui-gallery-entry').ComfyGalleryEntry[];
}): Promise<{
  job: TrainJob;
  jobs: TrainJob[];
  datasetPath: string;
  exportCount: number;
  message: string;
}> {
  const { persistLoraDatasetOnServer } = await import('./gallery-lora-dataset-export');
  const exported = await persistLoraDatasetOnServer(input.keepers, {
    triggerWord: input.trigger.trim(),
    characterId: input.character.id,
    lookId: input.lookId,
  });
  if (exported.count === 0 || !exported.datasetPath) {
    throw new Error('Could not export any keeper stills to the server dataset folder.');
  }

  const trained = await startCharacterLookTrain({
    character: input.character,
    lookId: input.lookId,
    lookName: input.lookName,
    trigger: input.trigger,
    datasetPath: exported.datasetPath,
  });

  return {
    job: trained.job,
    jobs: trained.jobs,
    datasetPath: exported.datasetPath,
    exportCount: exported.count,
    message: `${trained.message} Exported ${exported.count} keepers → train.`,
  };
}

export async function registerCharacterLookLora(input: {
  job: TrainJob;
  characterId: string;
  trigger?: string;
  outputPath?: string;
}): Promise<{ job: TrainJob; jobs: TrainJob[]; message: string }> {
  const settings = loadComfyUiSettings();
  const shared = loadSettingsCache().shared;
  const prefs = normalizeLoraTrainTrainerPrefs(shared.loraTrainTrainerPrefs);
  const outputPath =
    input.job.outputPath.trim() || input.outputPath?.trim() || prefs.outputDir?.trim() || '';
  const trigger = input.job.trigger.trim() || input.trigger?.trim() || '';
  if (!outputPath) {
    throw new Error('Set an output path (LoRA filename) before registering.');
  }

  const response = await fetch('/api/lora-train', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'complete',
      jobId: input.job.id,
      outputPath,
      trigger,
      library: settings.loraLibrary,
      sessionActiveLoraIds: shared.sessionActiveLoraIds,
      activateInSession: prefs.activateOnRegister !== false,
      label: trigger || undefined,
      characterId: input.characterId,
    }),
  });
  const data = (await response.json()) as {
    error?: string;
    job?: TrainJob;
    registered?: boolean;
    entry?: { id: string; label: string; triggerPhrase: string };
    library?: typeof settings.loraLibrary;
    sessionActiveLoraIds?: string[];
  };
  if (!response.ok) {
    throw new Error(data.error || 'Failed to register LoRA.');
  }

  let nextJob = data.job ?? { ...input.job, outputPath, trigger, status: 'completed' as const };
  if (data.registered && data.library) {
    saveComfyUiSettings({
      ...settings,
      loraLibrary: data.library,
    });
  } else {
    const registered = registerTrainJobLora(
      settings.loraLibrary,
      { ...input.job, outputPath, trigger },
      {
        activateInSession: prefs.activateOnRegister !== false,
        sessionActiveLoraIds: shared.sessionActiveLoraIds,
        label: trigger || undefined,
      }
    );
    saveComfyUiSettings({
      ...settings,
      loraLibrary: registered.library,
    });
    nextJob = registered.job;
  }

  nextJob = {
    ...nextJob,
    characterId: nextJob.characterId || input.characterId,
  };
  const jobs = persistTrainJobs(
    upsertTrainJob(normalizeTrainJobs(loadSettingsCache().shared.loraTrainJobs), nextJob)
  );

  if (nextJob.loraLibraryId) {
    pinLoraOnCharacter(input.characterId, nextJob.loraLibraryId);
  }
  if (nextJob.trigger.trim()) {
    setCharacterTrigger(input.characterId, nextJob.trigger);
  }

  // 2.0: activate pinned Cast LoRAs into session + byModel (not legacy session-only).
  if (prefs.activateOnRegister !== false) {
    const { getCharacter } = await import('./character-os');
    const character = getCharacter(input.characterId);
    if (character) {
      saveSharedSettings({
        ...loadSettingsCache().shared,
        ...applyCharacterRecord(character),
      });
    } else if (data.sessionActiveLoraIds) {
      const current = loadSettingsCache().shared;
      const { setSessionLoraIdsForModel } = await import('./model-lora-map');
      saveSharedSettings({
        ...current,
        sessionActiveLoraIds: data.sessionActiveLoraIds,
        sessionActiveLoraIdsByModel: setSessionLoraIdsForModel(
          current.sessionActiveLoraIdsByModel,
          current.model,
          data.sessionActiveLoraIds
        ),
      });
    }
  }

  let message = data.entry
    ? `Pinned “${data.entry.label || data.entry.id}” on this character with trigger “${data.entry.triggerPhrase || nextJob.trigger}”.`
    : `Train job ${nextJob.id} marked complete.`;

  if (prefs.autoQueueValidation) {
    const { getCharacter } = await import('./character-os');
    const character = getCharacter(input.characterId);
    if (character) {
      const validation = await queueCharacterLookValidation({
        character,
        trigger: nextJob.trigger || trigger,
      });
      if (validation.queued) {
        message = `${message} Validation still queued (Prove).`;
      }
    }
  }

  return {
    job: nextJob,
    jobs,
    message,
  };
}

export async function queueCharacterLookValidation(input: {
  character: CharacterRecord;
  trigger?: string;
}): Promise<{ prompt: string; queued: boolean; promptId: string | null }> {
  const trigger = input.trigger?.trim() || loraTriggerFromCharacter(input.character) || 'subject';
  const prompt = buildLoraTrainValidationPrompt(trigger);
  // 2.0: pin Cast face + LoRAs on Prove-it the same way Day/Story do.
  syncSharedIdentityToCast(input.character);
  saveSharedSettings({
    ...loadSettingsCache().shared,
    ...applyCharacterRecord(input.character),
  });

  const { postComfyUiPrompt } = await import('./comfyui-queue-request');
  const { resolveQueueNegativePrompt } = await import('./queue-negative');
  const { resolveQueueParams } = await import('./queue-params-settings');
  const { resolveRuntimeForQueue } = await import('./comfyui-runtime-for-model');
  const { registerComfyGalleryJob } = await import('./comfyui-gallery-client');
  const { scheduleComfyGalleryPoll } = await import('./comfyui-gallery-poller');
  const { resolveSharedEffectiveSessionLoraIds } = await import('./comfyui-settings');

  const shared = loadSettingsCache().shared;
  const { faceBase, sessionActiveLoraIds: castLoras } = characterLookValidationQueuePins(
    input.character,
    shared.ipAdapterStrength ?? 0.75
  );
  const negativePrompt = await resolveQueueNegativePrompt({
    model: shared.model,
    tool: 'generate',
  });
  const runtime = resolveRuntimeForQueue(shared.model, 'generate', {
    ...(castLoras ? { sessionActiveLoraIds: castLoras } : {}),
  });
  const params = resolveQueueParams({
    model: shared.model,
    tool: 'generate',
    ...(faceBase ? { base: faceBase } : {}),
  });
  const queued = await postComfyUiPrompt({
    prompts: [prompt],
    negativePrompt,
    paramsPerPrompt: [params],
    ...(runtime ? { comfy: runtime } : {}),
  });
  const data = queued.raw as {
    results?: Array<{ promptId?: string; comfyUrl?: string }>;
    comfyUrl?: string;
  };
  const result = data.results?.[0];
  const ok = queued.status < 400 && Boolean(result?.promptId);
  if (ok && result?.promptId) {
    registerComfyGalleryJob({
      promptId: result.promptId,
      prompt,
      negativePrompt,
      tool: 'lora-validation',
      model: shared.model,
      comfyUrl: result.comfyUrl ?? data.comfyUrl ?? queued.comfyUrl ?? 'http://127.0.0.1:8188',
      clientId: queued.clientId,
      queueParams: params,
      characterId: input.character.id,
      lookId: input.character.activeLookId,
      sessionActiveLoraIds: castLoras ?? resolveSharedEffectiveSessionLoraIds(shared.model),
    });
    void scheduleComfyGalleryPoll(result.promptId, {
      comfyUrl: result.comfyUrl ?? data.comfyUrl ?? queued.comfyUrl ?? 'http://127.0.0.1:8188',
      clientId: queued.clientId,
    });
  }
  queued.releaseLiveSocket();
  return { prompt, queued: ok, promptId: ok ? (result?.promptId ?? null) : null };
}
