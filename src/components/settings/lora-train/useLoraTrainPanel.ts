'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadComfyUiSettings, saveComfyUiSettings } from '@/lib/comfyui-settings';
import {
  buildLoraTrainValidationPrompt,
  createTrainJob,
  normalizeLoraTrainTrainerPrefs,
  normalizeTrainJobs,
  registerTrainJobLora,
  upsertTrainJob,
  type LoraTrainTrainerPrefs,
  type TrainJob,
} from '@/lib/lora-train-job';
import { pinLoraOnCharacter, setCharacterTrigger } from '@/lib/character-os';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { useAuth } from '@/hooks/useAuth';
import { mergeJobs } from '@/components/settings/lora-train/lora-train-utils';

export function useLoraTrainPanel(onStatus?: (message: string) => void) {
  const auth = useAuth();
  const canEditTrainer = !auth?.authEnabled || Boolean(auth?.isAdmin);
  const [prefs, setPrefs] = useState<LoraTrainTrainerPrefs>(() =>
    normalizeLoraTrainTrainerPrefs(loadSettingsCache().shared.loraTrainTrainerPrefs)
  );
  const [jobs, setJobs] = useState<TrainJob[]>(() =>
    normalizeTrainJobs(loadSettingsCache().shared.loraTrainJobs)
  );
  const [trigger, setTrigger] = useState(
    () => loadSettingsCache().shared.loraDatasetExportPrefs?.triggerWord ?? ''
  );
  const [outputPath, setOutputPath] = useState(() => prefs.outputDir ?? '');
  const [datasetPath, setDatasetPath] = useState(() => prefs.datasetPath ?? '');
  const [busy, setBusy] = useState(false);
  const [envFlags, setEnvFlags] = useState<{
    envUrl: boolean;
    envCommand: boolean;
    envKohya: boolean;
  }>({
    envUrl: false,
    envCommand: false,
    envKohya: false,
  });
  const [validationPrompt, setValidationPrompt] = useState<string | null>(null);

  const queueValidationByPrompt = useCallback(
    async (prompt: string) => {
      const { postComfyUiPrompt } = await import('@/lib/comfyui-queue-request');
      const { resolveQueueNegativePrompt } = await import('@/lib/queue-negative');
      const { resolveQueueParams } = await import('@/lib/queue-params-settings');
      const { resolveRuntimeForQueue } = await import('@/lib/comfyui-runtime-for-model');
      const { registerComfyGalleryJob } = await import('@/lib/comfyui-gallery-client');
      const { scheduleComfyGalleryPoll } = await import('@/lib/comfyui-gallery-poller');
      const { shared } = loadSettingsCache();
      const negativePrompt = await resolveQueueNegativePrompt({
        model: shared.model,
        tool: 'generate',
      });
      const runtime = resolveRuntimeForQueue(shared.model, 'generate');
      const params = resolveQueueParams({
        model: shared.model,
        tool: 'generate',
      });
      onStatus?.('Queueing LoRA validation…');
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
      if (queued.status < 400 && result?.promptId) {
        registerComfyGalleryJob({
          promptId: result.promptId,
          prompt,
          negativePrompt,
          tool: 'lora-validation',
          model: shared.model,
          comfyUrl: result.comfyUrl ?? data.comfyUrl ?? queued.comfyUrl ?? 'http://127.0.0.1:8188',
          clientId: queued.clientId,
          queueParams: params,
        });
        void scheduleComfyGalleryPoll(result.promptId, {
          comfyUrl: result.comfyUrl ?? data.comfyUrl ?? queued.comfyUrl ?? 'http://127.0.0.1:8188',
          clientId: queued.clientId,
        });
        onStatus?.('Validation queued — check Gallery for output.');
      } else {
        onStatus?.('Validation queue failed.');
      }
      queued.releaseLiveSocket();
    },
    [onStatus]
  );

  const persistJobs = useCallback((nextJobs: TrainJob[]) => {
    const shared = loadSettingsCache().shared;
    saveSharedSettings({ ...shared, loraTrainJobs: nextJobs });
    setJobs(nextJobs);
  }, []);

  const persistPrefs = useCallback((next: LoraTrainTrainerPrefs) => {
    const normalized = normalizeLoraTrainTrainerPrefs(next);
    const shared = loadSettingsCache().shared;
    saveSharedSettings({ ...shared, loraTrainTrainerPrefs: normalized });
    setPrefs(normalized);
  }, []);

  const refreshFromServer = useCallback(async () => {
    try {
      const response = await fetch('/api/lora-train');
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as {
        jobs?: TrainJob[];
        trainer?: { envUrl?: boolean; envCommand?: boolean; envKohya?: boolean };
      };
      setEnvFlags({
        envUrl: Boolean(data.trainer?.envUrl),
        envCommand: Boolean(data.trainer?.envCommand),
        envKohya: Boolean(data.trainer?.envKohya),
      });
      const local = normalizeTrainJobs(loadSettingsCache().shared.loraTrainJobs);
      const merged = mergeJobs(local, data.jobs ?? []);
      // This polls every 8 s while Settings is open; saving unchanged jobs re-saved settings
      // (and pushed them to the server) on every tick.
      if (JSON.stringify(merged) === JSON.stringify(local)) {
        setJobs(merged);
        return;
      }
      persistJobs(merged);
    } catch {
      // offline / server cold — keep local jobs
    }
  }, [persistJobs]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      void refreshFromServer();
    });
    const timer = window.setInterval(() => {
      void refreshFromServer();
    }, 8_000);
    return () => window.clearInterval(timer);
  }, [refreshFromServer]);

  const trainerHint = useMemo(() => {
    if (envFlags.envUrl) {
      return 'Server TRAINER_URL is set — start will POST that webhook.';
    }
    if (envFlags.envCommand) {
      return 'Server TRAINER_COMMAND is set — start will spawn that process (no shell).';
    }
    if (envFlags.envKohya || prefs.kohyaScript?.trim()) {
      return 'Using kohya / sd-scripts template (TRAINER_KOHYA_SCRIPT or Settings path).';
    }
    if (prefs.trainerUrl?.trim()) {
      return 'Using Settings trainer URL (no TRAINER_URL env).';
    }
    if (prefs.trainerCommand?.trim()) {
      return 'Using Settings trainer command (no TRAINER_COMMAND env).';
    }
    return 'No trainer URL/command/kohya script — start records a manual job; mark complete when weights exist.';
  }, [envFlags, prefs.kohyaScript, prefs.trainerCommand, prefs.trainerUrl]);

  const startJob = useCallback(async () => {
    setBusy(true);
    setValidationPrompt(null);
    try {
      const response = await fetch('/api/lora-train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          trigger: trigger.trim(),
          outputPath: outputPath.trim() || prefs.outputDir?.trim() || '',
          datasetPath: datasetPath.trim() || prefs.datasetPath?.trim() || undefined,
          baseModel: prefs.baseModel?.trim() || undefined,
          trainerUrl: prefs.trainerUrl?.trim() || undefined,
          trainerCommand: prefs.trainerCommand?.trim() || undefined,
          templateId: prefs.templateId?.trim() || undefined,
          kohyaScript: prefs.kohyaScript?.trim() || undefined,
          networkRank: prefs.networkRank,
          maxTrainSteps: prefs.maxTrainSteps,
          resolution: prefs.resolution,
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
      const local = normalizeTrainJobs(loadSettingsCache().shared.loraTrainJobs);
      const merged = mergeJobs(local, data.jobs ?? (data.job ? [data.job] : []));
      persistJobs(merged);
      const message =
        data.job?.status === 'manual'
          ? `Manual train job ${data.job.id} recorded — register when the weight is ready.`
          : `Train job ${data.job?.id ?? ''} started (${data.job?.status ?? 'pending'}).`;
      onStatus?.(message);
    } catch (error) {
      onStatus?.(error instanceof Error ? error.message : 'Failed to start train job.');
    } finally {
      setBusy(false);
    }
  }, [datasetPath, onStatus, outputPath, persistJobs, prefs, trigger]);

  const registerJob = useCallback(
    async (job: TrainJob) => {
      setBusy(true);
      setValidationPrompt(null);
      try {
        const settings = loadComfyUiSettings();
        const shared = loadSettingsCache().shared;
        const activate = prefs.activateOnRegister !== false;

        const response = await fetch('/api/lora-train', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'complete',
            jobId: job.id,
            outputPath: job.outputPath || outputPath.trim() || prefs.outputDir,
            trigger: job.trigger || trigger.trim(),
            library: settings.loraLibrary,
            sessionActiveLoraIds: shared.sessionActiveLoraIds,
            activateInSession: activate,
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
          throw new Error(data.error || 'Failed to complete train job.');
        }

        let nextJob = data.job ?? job;
        if (data.registered && data.library) {
          saveComfyUiSettings({
            ...settings,
            loraLibrary: data.library,
          });
          if (activate && data.sessionActiveLoraIds) {
            saveSharedSettings({
              ...shared,
              sessionActiveLoraIds: data.sessionActiveLoraIds,
            });
          }
        } else if (job.outputPath.trim() || outputPath.trim()) {
          const registered = registerTrainJobLora(
            settings.loraLibrary,
            {
              ...job,
              outputPath: job.outputPath || outputPath.trim(),
              trigger: job.trigger || trigger.trim(),
            },
            {
              activateInSession: activate,
              sessionActiveLoraIds: shared.sessionActiveLoraIds,
            }
          );
          saveComfyUiSettings({
            ...settings,
            loraLibrary: registered.library,
          });
          if (activate && registered.sessionActiveLoraIds) {
            saveSharedSettings({
              ...loadSettingsCache().shared,
              sessionActiveLoraIds: registered.sessionActiveLoraIds,
            });
          }
          nextJob = registered.job;
        }

        const nextJobs = upsertTrainJob(
          normalizeTrainJobs(loadSettingsCache().shared.loraTrainJobs),
          nextJob
        );
        persistJobs(nextJobs);

        const characterId =
          nextJob.characterId?.trim() || loadSettingsCache().shared.activeCharacterId?.trim();
        if (characterId && nextJob.loraLibraryId) {
          pinLoraOnCharacter(characterId, nextJob.loraLibraryId);
          if (nextJob.trigger.trim()) {
            setCharacterTrigger(characterId, nextJob.trigger);
          }
        }

        const prompt = buildLoraTrainValidationPrompt(nextJob.trigger || trigger);
        setValidationPrompt(prompt);
        if (prefs.autoQueueValidation) {
          void queueValidationByPrompt(prompt);
        }
        onStatus?.(
          data.entry
            ? `Registered LoRA “${data.entry.label || data.entry.id}” with trigger “${data.entry.triggerPhrase || nextJob.trigger}”.`
            : `Train job ${nextJob.id} marked complete.`
        );
      } catch (error) {
        onStatus?.(error instanceof Error ? error.message : 'Failed to register LoRA.');
      } finally {
        setBusy(false);
      }
    },
    [onStatus, outputPath, persistJobs, prefs, queueValidationByPrompt, trigger]
  );

  const markManualComplete = useCallback(
    (job: TrainJob) => {
      const path = job.outputPath.trim() || outputPath.trim() || prefs.outputDir?.trim();
      if (!path) {
        onStatus?.('Set an output path (LoRA filename) before registering.');
        return;
      }
      void registerJob({
        ...job,
        outputPath: path,
        trigger: job.trigger || trigger.trim(),
      });
    },
    [onStatus, outputPath, prefs.outputDir, registerJob, trigger]
  );

  return {
    canEditTrainer,
    prefs,
    jobs,
    trigger,
    setTrigger,
    outputPath,
    setOutputPath,
    datasetPath,
    setDatasetPath,
    busy,
    envFlags,
    validationPrompt,
    trainerHint,
    persistPrefs,
    refreshFromServer,
    startJob,
    markManualComplete,
    queueValidationByPrompt,
    persistJobs,
    onStatus,
  };
}

export type LoraTrainPanelViewModel = ReturnType<typeof useLoraTrainPanel>;
