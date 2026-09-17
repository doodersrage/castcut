'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldLabel } from '@/components/ui/Field';
import { ToolActionRow, ToolSection } from '@/components/ui/ToolPageShell';
import {
  clampPercent,
  formatProgress,
  statusTone,
} from '@/components/settings/lora-train/lora-train-utils';
import {
  loraTriggerFromCharacter,
  pinLoraOnCharacter,
  setCharacterTrigger,
  type CharacterLook,
  type CharacterRecord,
} from '@/lib/character-os';
import {
  queueCharacterLookValidation,
  registerCharacterLookLora,
  exportKeepersAndTrain,
  trainJobsForCharacter,
} from '@/lib/character-lora-flywheel';
import { downloadLoraDatasetZip } from '@/lib/gallery-lora-dataset-export';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { normalizeTrainJobs, type TrainJob } from '@/lib/lora-train-job';
import { loadSettingsCache } from '@/lib/settings-cache';
import { galleryEntryThumbUrls, type ComfyGalleryEntry } from '@/lib/comfyui-gallery';

export default function CharacterLoraFlywheel({
  character,
  look,
  keepers,
  onApplied,
}: {
  character: CharacterRecord;
  look: CharacterLook;
  keepers: ComfyGalleryEntry[];
  onApplied: (next?: CharacterRecord) => void;
}) {
  const [triggerDraft, setTriggerDraft] = useState<string | null>(null);
  const [pinLoraId, setPinLoraId] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<TrainJob[]>(() =>
    trainJobsForCharacter(
      normalizeTrainJobs(loadSettingsCache().shared.loraTrainJobs),
      character.id
    )
  );
  const [library] = useState(() =>
    typeof window === 'undefined' ? [] : (loadComfyUiSettings().loraLibrary ?? [])
  );
  const [provePromptId, setProvePromptId] = useState<string | null>(null);

  const trigger = triggerDraft ?? loraTriggerFromCharacter(character) ?? '';
  const explicit = look.keeperEntryIds !== undefined;
  const activeJob = jobs.find(job => job.status === 'running') ?? jobs[0];
  const registerJob = jobs.find(job => job.status === 'completed' && !job.loraLibraryId);
  const hasPinned = Boolean(character.loraLibraryIds?.length);
  const phase: 'keepers' | 'train' | 'register' | 'prove' =
    keepers.length === 0 ? 'keepers' : registerJob ? 'register' : hasPinned ? 'prove' : 'train';

  const refreshJobs = useCallback(async () => {
    try {
      const response = await fetch('/api/lora-train');
      if (!response.ok) {
        setJobs(
          trainJobsForCharacter(
            normalizeTrainJobs(loadSettingsCache().shared.loraTrainJobs),
            character.id
          )
        );
        return;
      }
      const data = (await response.json()) as { jobs?: TrainJob[] };
      const { mergeTrainJobs, persistTrainJobs } = await import('@/lib/character-lora-flywheel');
      const merged = persistTrainJobs(
        mergeTrainJobs(
          normalizeTrainJobs(loadSettingsCache().shared.loraTrainJobs),
          data.jobs ?? []
        )
      );
      setJobs(trainJobsForCharacter(merged, character.id));
    } catch {
      setJobs(
        trainJobsForCharacter(
          normalizeTrainJobs(loadSettingsCache().shared.loraTrainJobs),
          character.id
        )
      );
    }
  }, [character.id]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      void refreshJobs();
    });
    const timer = window.setInterval(
      () => {
        void refreshJobs();
      },
      activeJob?.status === 'running' ? 2_500 : 8_000
    );
    return () => window.clearInterval(timer);
  }, [refreshJobs, activeJob?.status]);

  const persistTrigger = () => {
    onApplied(setCharacterTrigger(character.id, trigger));
  };

  return (
    <ToolSection
      title="LoRA flywheel"
      description="Keep → Train → Register → Prove. Keepers on this look become the dataset; after pin, Day and Story auto-apply the LoRA."
      data-testid="lora-flywheel"
    >
      <p className="type-caption text-[var(--text-muted)]" data-testid="lora-flywheel-phase">
        Next: {phase === 'keepers' && 'Keep stills on this look (Gallery Keep or Outfit Keep)'}
        {phase === 'train' && 'Export → Train with a trigger word'}
        {phase === 'register' && 'Register & pin the finished weight'}
        {phase === 'prove' && 'Prove it with a validation still'}
      </p>
      {keepers.length > 0 ? (
        <div className="space-y-2" data-testid="lora-flywheel-keepers">
          <FieldLabel>Keepers ({keepers.length})</FieldLabel>
          <ul className="flex flex-wrap gap-2">
            {keepers.slice(0, 12).map(entry => {
              const thumb = galleryEntryThumbUrls(entry)[0];
              return (
                <li
                  key={entry.id}
                  className="h-14 w-14 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-muted)]"
                  title={entry.prompt?.slice(0, 80) || entry.id}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center type-overline text-[var(--text-muted)]">
                      still
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {keepers.length > 12 ? (
            <p className="type-caption text-[var(--text-muted)]">+{keepers.length - 12} more</p>
          ) : null}
        </div>
      ) : (
        <p
          className="type-caption text-[var(--text-muted)]"
          data-testid="lora-flywheel-keepers-empty"
        >
          No keepers yet — mark Gallery favorites or Outfit Keep stills for {look.name}, then come
          back.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <FieldLabel>Trigger</FieldLabel>
          <div className="flex flex-wrap gap-2">
            <input
              value={trigger}
              onChange={event => setTriggerDraft(event.target.value)}
              placeholder="rinstyle"
              className="ui-input min-w-[8rem] flex-1 px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
              aria-label="LoRA trigger"
            />
            <Button size="sm" variant="secondary" onClick={persistTrigger}>
              Save trigger
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <FieldLabel>Pin library LoRA</FieldLabel>
          <div className="flex flex-wrap gap-2">
            <select
              className="ui-input min-w-[10rem] flex-1 px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
              value={pinLoraId}
              onChange={event => setPinLoraId(event.target.value)}
              aria-label="LoRA to pin"
            >
              <option value="">Select from library</option>
              {library.map(entry => (
                <option key={entry.id} value={entry.id}>
                  {entry.label || entry.tokenValue || entry.id}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              disabled={!pinLoraId}
              onClick={() => {
                const next = pinLoraOnCharacter(character.id, pinLoraId);
                onApplied(next);
                setPinLoraId('');
              }}
            >
              Pin
            </Button>
          </div>
        </div>
      </div>

      <p className="type-caption text-[var(--text-muted)]">
        {keepers.length} keeper{keepers.length === 1 ? '' : 's'} on {look.name}
        {explicit ? '' : ' · from favorites until you mark stills'}
        {character.loraLibraryIds?.length
          ? ` · ${character.loraLibraryIds.length} pinned LoRA`
          : ''}
      </p>

      <ToolActionRow>
        <Button
          size="sm"
          variant={phase === 'train' ? 'primary' : 'secondary'}
          loading={busy && phase === 'train'}
          loadingLabel="Training"
          disabled={keepers.length === 0 || !trigger.trim() || busy}
          data-testid="lora-flywheel-train"
          onClick={() => {
            persistTrigger();
            setBusy(true);
            setStatus('Export keepers → Train this look…');
            void exportKeepersAndTrain({
              character,
              lookId: look.id,
              lookName: look.name,
              trigger: trigger.trim(),
              keepers,
            })
              .then(result => {
                setJobs(trainJobsForCharacter(result.jobs, character.id));
                setStatus(result.message);
              })
              .catch(error => {
                setStatus(error instanceof Error ? error.message : 'Could not start training.');
              })
              .finally(() => setBusy(false));
          }}
        >
          Export → Train
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={keepers.length === 0 || busy}
          onClick={() => {
            setStatus('Exporting…');
            void downloadLoraDatasetZip(keepers, { triggerWord: trigger.trim() })
              .then(result => setStatus(`Exported ${result.count} images (ZIP download).`))
              .catch(error => {
                setStatus(error instanceof Error ? error.message : 'Could not export dataset.');
              });
          }}
        >
          Export ZIP
        </Button>
        {registerJob ? (
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            data-testid="lora-flywheel-register"
            onClick={() => {
              setBusy(true);
              void registerCharacterLookLora({
                job: registerJob,
                characterId: character.id,
                trigger: trigger.trim(),
              })
                .then(result => {
                  setJobs(trainJobsForCharacter(result.jobs, character.id));
                  onApplied();
                  setStatus(result.message);
                  if (result.provePromptId) {
                    setProvePromptId(result.provePromptId);
                  }
                })
                .catch(error => {
                  setStatus(
                    error instanceof Error ? error.message : 'Could not register that LoRA.'
                  );
                })
                .finally(() => setBusy(false));
            }}
          >
            Register & pin
          </Button>
        ) : null}
        <Button
          size="sm"
          variant={phase === 'prove' ? 'primary' : 'secondary'}
          disabled={!trigger.trim() || busy}
          data-testid="lora-flywheel-prove"
          onClick={() => {
            persistTrigger();
            onApplied(character);
            setBusy(true);
            setStatus('Queueing a validation still…');
            void queueCharacterLookValidation({ character, trigger: trigger.trim() })
              .then(result => {
                setProvePromptId(result.promptId);
                setStatus(
                  result.queued
                    ? result.promptId
                      ? `Validation still queued (${result.promptId.slice(0, 8)}…) — open Gallery when it lands.`
                      : 'Validation still queued — it is stamped on this character.'
                    : 'Validation prompt ready, but the queue failed.'
                );
              })
              .catch(error => {
                setStatus(
                  error instanceof Error ? error.message : 'Could not queue a validation still.'
                );
              })
              .finally(() => setBusy(false));
          }}
        >
          Prove it
        </Button>
        <ButtonLink href="/settings?tab=comfyui&section=lora-train" size="sm" variant="ghost">
          Trainer settings
        </ButtonLink>
        {provePromptId ? (
          <ButtonLink
            href={`/gallery?promptId=${encodeURIComponent(provePromptId)}`}
            size="sm"
            variant="ghost"
            data-testid="lora-prove-gallery-link"
          >
            Open prove still
          </ButtonLink>
        ) : null}
      </ToolActionRow>

      {jobs.length > 0 ? (
        <ul className="ui-list">
          {jobs.map(job => (
            <li key={job.id} className="ui-list-row items-center">
              <div className="ui-list-primary min-w-0 space-y-1">
                <p className={`type-heading truncate ${statusTone(job.status)}`}>
                  {job.trigger || 'Train job'} · {job.status}
                </p>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-muted)]"
                  aria-hidden
                >
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-[width]"
                    style={{ width: `${clampPercent(job.progress)}%` }}
                  />
                </div>
                <p className="type-caption truncate text-[var(--text-muted)]">
                  {formatProgress(job.progress)}
                  {job.outputPath ? ` · ${job.outputPath}` : ''}
                  {job.error ? ` · ${job.error}` : ''}
                </p>
              </div>
              {job.status === 'completed' && job.loraLibraryId ? (
                <p className="type-caption text-[var(--tint-success-text)]">Pinned</p>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void registerCharacterLookLora({
                      job,
                      characterId: character.id,
                      trigger: trigger.trim(),
                    })
                      .then(result => {
                        setJobs(trainJobsForCharacter(result.jobs, character.id));
                        onApplied();
                        setStatus(result.message);
                      })
                      .catch(error => {
                        setStatus(
                          error instanceof Error ? error.message : 'Could not register that LoRA.'
                        );
                      })
                      .finally(() => setBusy(false));
                  }}
                >
                  Register & pin
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {status ? <p className="type-caption text-[var(--text-muted)]">{status}</p> : null}
    </ToolSection>
  );
}
