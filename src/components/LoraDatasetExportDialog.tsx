'use client';

import { useEffect, useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FieldLabel, SelectInput, TextInput } from '@/components/ui/Field';
import type { LoraCaptionMode } from '@/lib/gallery/lora-dataset-export';
import type { LoraDatasetExportUiOptions } from '@/lib/lora/dataset-export-ui';
import { normalizeLoraDatasetExportPrefs } from '@/lib/lora/train-job';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings/cache';
import { getCharacter, loraTriggerFromCharacter } from '@/lib/character/os';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';

type LoraDatasetExportDialogProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: (options: LoraDatasetExportUiOptions) => void;
};

export default function LoraDatasetExportDialog({
  open,
  onCancel,
  onConfirm,
}: LoraDatasetExportDialogProps) {
  const [triggerWord, setTriggerWord] = useState('');
  const [captionMode, setCaptionMode] = useState<LoraCaptionMode>('prompt');

  useEffect(() => {
    if (!open) {
      return;
    }
    const prefs = normalizeLoraDatasetExportPrefs(
      loadSettingsCache().shared.loraDatasetExportPrefs
    );
    scheduleAfterCommit(() => {
      const characterTrigger = loraTriggerFromCharacter(
        getCharacter(loadSettingsCache().shared.activeCharacterId)
      );
      setTriggerWord(prefs.triggerWord || characterTrigger || '');
      setCaptionMode(prefs.captionMode ?? 'prompt');
    });
  }, [open]);

  const confirm = () => {
    const options: LoraDatasetExportUiOptions = {
      triggerWord: triggerWord.trim() || undefined,
      captionMode,
    };
    const shared = loadSettingsCache().shared;
    saveSharedSettings({
      ...shared,
      loraDatasetExportPrefs: normalizeLoraDatasetExportPrefs({
        triggerWord: options.triggerWord,
        captionMode: options.captionMode,
      }),
    });
    onConfirm(options);
  };

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title="Export LoRA dataset"
      description="Caption mode and optional trigger word for the ZIP export. Prefs are remembered for the next export."
      testId="lora-dataset-export"
      footer={
        <>
          <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={confirm}>
            Export ZIP
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <FieldLabel>Trigger word (optional)</FieldLabel>
          <TextInput
            value={triggerWord}
            onChange={event => setTriggerWord(event.target.value)}
            placeholder="e.g. ohwx person"
            autoFocus
          />
        </label>

        <label className="block space-y-1.5">
          <FieldLabel>Caption mode</FieldLabel>
          <SelectInput
            value={captionMode}
            onChange={event => setCaptionMode(event.target.value as LoraCaptionMode)}
          >
            <option value="prompt">prompt — cleaned gallery prompt</option>
            <option value="tags">tags — prompt + vision tags</option>
            <option value="vision">vision — LLM caption (slower)</option>
          </SelectInput>
        </label>
      </div>
    </Dialog>
  );
}
