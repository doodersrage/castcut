'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldLabel, TextInput } from '@/components/ui/Field';
import type { LoraTrainPanelViewModel } from '@/components/settings/lora-train/useLoraTrainPanel';
import { LORA_TRAIN_TEMPLATES } from '@/lib/lora/train-templates';

type Props = Pick<
  LoraTrainPanelViewModel,
  | 'canEditTrainer'
  | 'prefs'
  | 'trigger'
  | 'setTrigger'
  | 'outputPath'
  | 'setOutputPath'
  | 'datasetPath'
  | 'setDatasetPath'
  | 'busy'
  | 'envFlags'
  | 'trainerHint'
  | 'persistPrefs'
  | 'refreshFromServer'
  | 'startJob'
>;

export function LoraTrainPanelForm({
  canEditTrainer,
  prefs,
  trigger,
  setTrigger,
  outputPath,
  setOutputPath,
  datasetPath,
  setDatasetPath,
  busy,
  envFlags,
  trainerHint,
  persistPrefs,
  refreshFromServer,
  startJob,
}: Props) {
  const formId = useId();

  return (
    <>
      <p className="text-sm text-[var(--text-muted)]">
        GPU training runs out of process. Prefer a first-party kohya / sd-scripts template, or set a
        trainer webhook / command as an escape hatch. Jobs persist in SQLite under{' '}
        <code className="ui-inline-code">PROMPT_DATA_DIR</code>. Cast Export → Train writes a
        dataset folder and passes <code className="ui-inline-code">datasetPath</code> into start.
      </p>

      <p className="type-caption text-[var(--text-muted)]">{trainerHint}</p>
      <p className="type-caption text-[var(--text-muted)]">
        Env <code className="ui-inline-code">TRAINER_URL</code> /{' '}
        <code className="ui-inline-code">TRAINER_COMMAND</code> /{' '}
        <code className="ui-inline-code">TRAINER_KOHYA_SCRIPT</code> win until the Next.js process
        restarts. Settings values apply only when those env vars are unset. Studio never spawns a
        trainer from the browser.
      </p>
      {!canEditTrainer ? (
        <p className="type-caption text-[var(--tint-warning-text)]">
          Admin sign-in required to edit trainer URL or command.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 sm:col-span-2">
          <FieldLabel htmlFor={`${formId}-template`}>Kohya template</FieldLabel>
          <select
            id={`${formId}-template`}
            className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
            value={prefs.templateId ?? 'kohya-sdxl'}
            onChange={event => persistPrefs({ ...prefs, templateId: event.target.value })}
            disabled={!canEditTrainer || envFlags.envUrl || envFlags.envCommand}
          >
            {LORA_TRAIN_TEMPLATES.map(template => (
              <option key={template.id} value={template.id}>
                {template.label} — {template.description}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5 sm:col-span-2">
          <FieldLabel htmlFor={`${formId}-kohya`}>Kohya train_network.py</FieldLabel>
          <TextInput
            id={`${formId}-kohya`}
            value={prefs.kohyaScript ?? ''}
            onChange={event => persistPrefs({ ...prefs, kohyaScript: event.target.value })}
            placeholder="/path/to/sd-scripts/train_network.py"
            disabled={envFlags.envKohya || !canEditTrainer}
            className="font-mono text-sm"
          />
        </label>
        <label className="block space-y-1.5">
          <FieldLabel htmlFor={`${formId}-rank`}>Network rank</FieldLabel>
          <TextInput
            id={`${formId}-rank`}
            type="number"
            min={1}
            max={256}
            value={prefs.networkRank ?? ''}
            onChange={event => {
              const raw = event.target.value.trim();
              persistPrefs({
                ...prefs,
                networkRank: raw ? Number(raw) : undefined,
              });
            }}
            placeholder="16"
            disabled={!canEditTrainer}
          />
        </label>
        <label className="block space-y-1.5">
          <FieldLabel htmlFor={`${formId}-steps`}>Max steps</FieldLabel>
          <TextInput
            id={`${formId}-steps`}
            type="number"
            min={1}
            value={prefs.maxTrainSteps ?? ''}
            onChange={event => {
              const raw = event.target.value.trim();
              persistPrefs({
                ...prefs,
                maxTrainSteps: raw ? Number(raw) : undefined,
              });
            }}
            placeholder="1500"
            disabled={!canEditTrainer}
          />
        </label>
        <label className="block space-y-1.5">
          <FieldLabel htmlFor={`${formId}-res`}>Resolution</FieldLabel>
          <TextInput
            id={`${formId}-res`}
            type="number"
            min={64}
            step={64}
            value={prefs.resolution ?? ''}
            onChange={event => {
              const raw = event.target.value.trim();
              persistPrefs({
                ...prefs,
                resolution: raw ? Number(raw) : undefined,
              });
            }}
            placeholder="1024"
            disabled={!canEditTrainer}
          />
        </label>
        <label className="block space-y-1.5 sm:col-span-2">
          <FieldLabel htmlFor={`${formId}-dataset`}>Dataset path</FieldLabel>
          <TextInput
            id={`${formId}-dataset`}
            value={datasetPath}
            onChange={event => {
              setDatasetPath(event.target.value);
              persistPrefs({ ...prefs, datasetPath: event.target.value });
            }}
            placeholder="/var/lib/prompt-studio/lora-datasets/…"
            className="font-mono text-sm"
          />
        </label>
        <label className="block space-y-1.5 sm:col-span-2">
          <FieldLabel htmlFor={`${formId}-url`}>Trainer URL (escape hatch)</FieldLabel>
          <TextInput
            id={`${formId}-url`}
            value={prefs.trainerUrl ?? ''}
            onChange={event => persistPrefs({ ...prefs, trainerUrl: event.target.value })}
            placeholder="http://127.0.0.1:7860/train"
            disabled={envFlags.envUrl || !canEditTrainer}
          />
        </label>
        <label className="block space-y-1.5 sm:col-span-2">
          <FieldLabel htmlFor={`${formId}-cmd`}>Trainer command (escape hatch)</FieldLabel>
          <TextInput
            id={`${formId}-cmd`}
            value={prefs.trainerCommand ?? ''}
            onChange={event => persistPrefs({ ...prefs, trainerCommand: event.target.value })}
            placeholder="/path/to/custom-wrapper --config …"
            disabled={envFlags.envCommand || !canEditTrainer}
            className="font-mono text-sm"
          />
        </label>
        <label className="block space-y-1.5">
          <FieldLabel htmlFor={`${formId}-out`}>Output path / LoRA file</FieldLabel>
          <TextInput
            id={`${formId}-out`}
            value={outputPath}
            onChange={event => {
              setOutputPath(event.target.value);
              persistPrefs({ ...prefs, outputDir: event.target.value });
            }}
            placeholder="my_character_v1.safetensors"
            className="font-mono text-sm"
          />
        </label>
        <label className="block space-y-1.5">
          <FieldLabel htmlFor={`${formId}-base`}>Base model</FieldLabel>
          <TextInput
            id={`${formId}-base`}
            value={prefs.baseModel ?? ''}
            onChange={event => persistPrefs({ ...prefs, baseModel: event.target.value })}
            placeholder="/models/checkpoints/sd_xl_base_1.0.safetensors"
            className="font-mono text-sm"
          />
        </label>
        <label className="block space-y-1.5 sm:col-span-2">
          <FieldLabel htmlFor={`${formId}-trigger`}>Trigger word</FieldLabel>
          <TextInput
            id={`${formId}-trigger`}
            value={trigger}
            onChange={event => setTrigger(event.target.value)}
            placeholder="ohwx person"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={prefs.activateOnRegister !== false}
          onChange={event => persistPrefs({ ...prefs, activateOnRegister: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
        />
        Activate in session LoRA stack on register
      </label>
      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={prefs.autoQueueValidation === true}
          onChange={event => persistPrefs({ ...prefs, autoQueueValidation: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
        />
        Auto-queue validation render when a train job registers
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          loading={busy}
          onClick={() => void startJob()}
        >
          Start train job
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void refreshFromServer()}
        >
          Refresh status
        </Button>
      </div>
    </>
  );
}
