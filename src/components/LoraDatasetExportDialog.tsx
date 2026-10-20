'use client';

import { useEffect, useId, useState } from 'react';
import ModalPortal from '@/components/ui/ModalPortal';
import { Button } from '@/components/ui/Button';
import { FieldLabel, SelectInput, TextInput } from '@/components/ui/Field';
import type { LoraCaptionMode } from '@/lib/gallery/lora-dataset-export';
import type { LoraDatasetExportUiOptions } from '@/lib/lora-dataset-export-ui';
import { normalizeLoraDatasetExportPrefs } from '@/lib/lora-train-job';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';
import { getCharacter, loraTriggerFromCharacter } from '@/lib/character-os';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

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
  const titleId = useId();
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

  if (!open) {
    return null;
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--bg-base)]/70 p-4 backdrop-blur-sm"
        role="presentation"
        onClick={onCancel}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
          onClick={event => event.stopPropagation()}
        >
          <div className="space-y-1">
            <h2 id={titleId} className="type-heading text-[var(--text-primary)]">
              Export LoRA dataset
            </h2>
            <p className="type-caption text-[var(--text-muted)]">
              Caption mode and optional trigger word for the ZIP export. Prefs are remembered for
              the next export.
            </p>
          </div>

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

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
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
              }}
            >
              Export ZIP
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
