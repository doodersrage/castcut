'use client';

import { useState } from 'react';
import { saveScheduledBatchConfig, type ScheduledBatchConfig } from '@/lib/scheduled-batch';
import type { ScheduledBatchServerStatus } from '@/lib/scheduled-batch-profile-sync';
import { detailLevelLabel, type DetailLevel } from '@/lib/detail-level';
import { QUEUE_QUALITY_PROFILE_OPTIONS } from '@/lib/queue-quality-profile';
import { COMFY_IMAGE_MODELS } from '@/lib/comfy-models/client';
import type { SharedToolSettings } from '@/lib/settings-cache';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { FieldLabel } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

export type ScheduledBatchPanelProps = {
  scheduledBatch: ScheduledBatchConfig;
  setScheduledBatch: (value: ScheduledBatchConfig) => void;
  serverScheduledBatchStatus: ScheduledBatchServerStatus | null;
  sharedSettings: SharedToolSettings;
  setStatus: (status: string | null) => void;
};

export default function ScheduledBatchPanel({
  scheduledBatch,
  setScheduledBatch,
  serverScheduledBatchStatus,
  sharedSettings,
  setStatus,
}: ScheduledBatchPanelProps) {
  const [schedulerDraft, setSchedulerDraft] = useState<{
    enabled?: boolean;
    intervalMinutes?: number;
  }>({});

  const serverScheduler = serverScheduledBatchStatus
    ? {
        ...serverScheduledBatchStatus,
        enabled: schedulerDraft.enabled ?? serverScheduledBatchStatus.enabled,
        intervalMinutes:
          schedulerDraft.intervalMinutes ?? serverScheduledBatchStatus.intervalMinutes,
      }
    : null;

  return (
    <ToolSection title="Scheduled batch" id="settings-scheduled-batch">
      <p className="text-sm text-[var(--text-secondary)]">
        Two runners exist: a{' '}
        <strong className="font-medium text-[var(--text-secondary)]">browser</strong> scheduler
        (needs this tab open) and an optional{' '}
        <strong className="font-medium text-[var(--text-secondary)]">headless server</strong> cron
        gated by env.
      </p>
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-3 text-xs text-[var(--text-secondary)]">
        <p className="mb-1 font-medium text-[var(--text-secondary)]">Headless server runner</p>
        <p className="mb-2">
          Requires <code className="text-[var(--text-secondary)]">PROMPT_DATA_DIR</code> to persist.
          Env <code className="text-[var(--text-secondary)]">SERVER_SCHEDULED_BATCH=true</code>{' '}
          still forces it on. The checkbox below is the Settings overlay.
        </p>
        {serverScheduler ? (
          <>
            <label className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={serverScheduler.enabled}
                onChange={event => {
                  const enabled = event.target.checked;
                  void fetch('/api/scheduled-batch/profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      enabled,
                      intervalMinutes: serverScheduler.intervalMinutes ?? 60,
                    }),
                  })
                    .then(response => response.json())
                    .then(data => {
                      setSchedulerDraft({
                        enabled,
                        intervalMinutes:
                          typeof data.intervalMinutes === 'number'
                            ? data.intervalMinutes
                            : serverScheduler.intervalMinutes,
                      });
                      setStatus(
                        data.persisted
                          ? `Server batch ${enabled ? 'enabled' : 'disabled'}.`
                          : 'Set PROMPT_DATA_DIR to persist server batch.'
                      );
                    });
                }}
                className="h-4 w-4 rounded"
              />
              Enable headless server batch
            </label>
            <label className="mb-2 block space-y-1">
              Interval (minutes)
              <input
                type="number"
                min={5}
                max={1440}
                value={serverScheduler.intervalMinutes ?? 60}
                onChange={event => {
                  const intervalMinutes = Number(event.target.value) || 60;
                  setSchedulerDraft(previous => ({ ...previous, intervalMinutes }));
                }}
                onBlur={() => {
                  void fetch('/api/scheduled-batch/profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      enabled: serverScheduler.enabled,
                      intervalMinutes: serverScheduler.intervalMinutes ?? 60,
                    }),
                  });
                }}
                className="ui-input max-w-[8rem] text-sm"
              />
            </label>
            <p>
              {serverScheduler.enabled ? 'Active.' : 'Disabled.'}{' '}
              {serverScheduler.persisted
                ? 'Profile persisted to server storage.'
                : 'Profile not persisted (set PROMPT_DATA_DIR).'}
            </p>
            <p className="mt-1">
              Using model{' '}
              <span className="text-[var(--text-primary)]">{serverScheduler.profile.model}</span> ·
              detail{' '}
              <span className="text-[var(--text-primary)]">{serverScheduler.profile.detail}</span> ·
              quality{' '}
              <span className="text-[var(--text-primary)]">
                {serverScheduler.profile.qualityProfile}
              </span>
            </p>
            <p className="mt-1">
              Last run:{' '}
              {serverScheduler.lastRunAt
                ? new Date(serverScheduler.lastRunAt).toLocaleString()
                : 'never'}
            </p>
          </>
        ) : (
          <p>Checking server status…</p>
        )}
      </div>
      <label className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={scheduledBatch.enabled}
          onChange={event => {
            const next = { ...scheduledBatch, enabled: event.target.checked };
            setScheduledBatch(next);
            saveScheduledBatchConfig(next);
          }}
          className={`h-4 w-4 rounded ${accentFocusClass()}`}
        />
        Enable browser scheduled batch (tab must stay open)
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="scheduled-interval">Interval (minutes)</FieldLabel>
          <input
            id="scheduled-interval"
            type="number"
            min={5}
            value={scheduledBatch.intervalMinutes}
            onChange={event => {
              const next = {
                ...scheduledBatch,
                intervalMinutes: Number(event.target.value) || 60,
              };
              setScheduledBatch(next);
              saveScheduledBatchConfig(next);
            }}
            className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
          />
        </div>
        <div>
          <FieldLabel htmlFor="scheduled-count">Prompt count</FieldLabel>
          <input
            id="scheduled-count"
            type="number"
            min={1}
            max={12}
            value={scheduledBatch.count}
            onChange={event => {
              const next = {
                ...scheduledBatch,
                count: Number(event.target.value) || 3,
              };
              setScheduledBatch(next);
              saveScheduledBatchConfig(next);
            }}
            className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
          />
        </div>
      </div>
      <FieldLabel htmlFor="scheduled-target">Target generator</FieldLabel>
      <select
        id="scheduled-target"
        value={scheduledBatch.target}
        onChange={event => {
          const next = {
            ...scheduledBatch,
            target: event.target.value as ScheduledBatchConfig['target'],
          };
          setScheduledBatch(next);
          saveScheduledBatchConfig(next);
        }}
        className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
      >
        <option value="random-scene">Random scene</option>
        <option value="topics">Topics batch</option>
        <option value="nsfw-generator">Adult generator</option>
      </select>
      <label className="mt-3 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={scheduledBatch.autoQueueComfyUi}
          onChange={event => {
            const next = {
              ...scheduledBatch,
              autoQueueComfyUi: event.target.checked,
            };
            setScheduledBatch(next);
            saveScheduledBatchConfig(next);
          }}
          className={`h-4 w-4 rounded ${accentFocusClass()}`}
        />
        Auto-queue to ComfyUI
      </label>
      <FieldLabel htmlFor="scheduled-genre">Genre/theme hint (optional)</FieldLabel>
      <input
        id="scheduled-genre"
        value={scheduledBatch.genre ?? ''}
        onChange={event => {
          const next = { ...scheduledBatch, genre: event.target.value || undefined };
          setScheduledBatch(next);
          saveScheduledBatchConfig(next);
        }}
        className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
      />
      <label className="mt-3 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={Boolean(scheduledBatch.overrideSharedSettings)}
          onChange={event => {
            const next = {
              ...scheduledBatch,
              overrideSharedSettings: event.target.checked,
              model: scheduledBatch.model ?? sharedSettings.model,
              detail: scheduledBatch.detail ?? sharedSettings.detail,
              qualityProfile: scheduledBatch.qualityProfile ?? sharedSettings.queueQualityProfile,
            };
            setScheduledBatch(next);
            saveScheduledBatchConfig(next);
          }}
          className={`h-4 w-4 rounded ${accentFocusClass()}`}
        />
        Override shared model / detail / quality for scheduled runs
      </label>
      {scheduledBatch.overrideSharedSettings ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <FieldLabel htmlFor="scheduled-model">Model</FieldLabel>
            <select
              id="scheduled-model"
              value={scheduledBatch.model ?? sharedSettings.model}
              onChange={event => {
                const next = { ...scheduledBatch, model: event.target.value };
                setScheduledBatch(next);
                saveScheduledBatchConfig(next);
              }}
              className="ui-input w-full"
            >
              {COMFY_IMAGE_MODELS.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="scheduled-detail">Detail</FieldLabel>
            <select
              id="scheduled-detail"
              value={scheduledBatch.detail ?? sharedSettings.detail}
              onChange={event => {
                const next = {
                  ...scheduledBatch,
                  detail: event.target.value as DetailLevel,
                };
                setScheduledBatch(next);
                saveScheduledBatchConfig(next);
              }}
              className="ui-input w-full"
            >
              {(['concise', 'balanced', 'rich'] as const).map(level => (
                <option key={level} value={level}>
                  {detailLevelLabel(level)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="scheduled-quality">Quality profile</FieldLabel>
            <select
              id="scheduled-quality"
              value={scheduledBatch.qualityProfile ?? sharedSettings.queueQualityProfile}
              onChange={event => {
                const next = {
                  ...scheduledBatch,
                  qualityProfile: event.target.value as SharedToolSettings['queueQualityProfile'],
                };
                setScheduledBatch(next);
                saveScheduledBatchConfig(next);
              }}
              className="ui-input w-full"
            >
              {QUEUE_QUALITY_PROFILE_OPTIONS.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Using shared model{' '}
          <span className="text-[var(--text-primary)]">{sharedSettings.model}</span> · detail{' '}
          {sharedSettings.detail} · quality {sharedSettings.queueQualityProfile}.
        </p>
      )}
      <div className="mt-3">
        <FieldLabel htmlFor="scheduled-best-of-n">Best-of-N ranking (LLM text rank)</FieldLabel>
        <select
          id="scheduled-best-of-n"
          value={scheduledBatch.bestOfN ?? 1}
          onChange={event => {
            const next = {
              ...scheduledBatch,
              bestOfN: Number(event.target.value) || 1,
            };
            setScheduledBatch(next);
            saveScheduledBatchConfig(next);
          }}
          className="ui-input w-full max-w-xs"
        >
          <option value={1}>Off — generate count only</option>
          <option value={2}>2× over-generate, rank to count</option>
          <option value={3}>3× over-generate, rank to count</option>
          <option value={4}>4× over-generate, rank to count</option>
        </select>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Generates count × N prompts, then LLM-picks the best before optional Comfy queue.
        </p>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={scheduledBatch.bestOfNVision ?? false}
          disabled={(scheduledBatch.bestOfN ?? 1) <= 1 || !scheduledBatch.autoQueueComfyUi}
          onChange={event => {
            const next = {
              ...scheduledBatch,
              bestOfNVision: event.target.checked,
            };
            setScheduledBatch(next);
            saveScheduledBatchConfig(next);
          }}
          className="h-4 w-4 rounded"
        />
        Vision-rank queued outputs after Comfy completes (needs LLM_VISION_MODEL)
      </label>
    </ToolSection>
  );
}
