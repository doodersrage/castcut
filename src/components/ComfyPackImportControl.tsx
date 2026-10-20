'use client';

import { useCallback, useRef, useState } from 'react';
import {
  filesToPackImportInputs,
  importComfyWorkflowPack,
  type PackImportResult,
} from '@/lib/workflow/pack-import';
import { markOnboardingSystemWorkflowsEnabled } from '@/lib/onboarding-hooks';
import { Button } from '@/components/ui/Button';

type ComfyPackImportControlProps = {
  /** Called after a successful import with a human summary + full result. */
  onImported?: (summary: string, result: PackImportResult) => void;
  /** Restrict hint copy to a media kind (audio / mesh / video). */
  preferKind?: 'audio' | 'mesh' | 'video';
  className?: string;
  compact?: boolean;
};

export default function ComfyPackImportControl({
  onImported,
  preferKind,
  className,
  compact,
}: ComfyPackImportControlProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [autoMap, setAutoMap] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const kindHint =
    preferKind === 'audio'
      ? 'Stable Audio / music API JSON (or a .zip of workflows)'
      : preferKind === 'mesh'
        ? 'Hunyuan3D / mesh API JSON (or a .zip of workflows)'
        : preferKind === 'video'
          ? 'WAN / Hunyuan / LTX API JSON (or a .zip of workflows)'
          : 'ComfyUI Save (API Format) JSON files or a .zip pack';

  const runImport = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length) {
        return;
      }
      setBusy(true);
      setError(null);
      setStatus(null);
      try {
        const inputs = await filesToPackImportInputs(fileList);
        if (inputs.length === 0) {
          setError(
            'No .json workflows found (use ComfyUI Save → API Format, or a .zip of those files).'
          );
          return;
        }
        const result = await importComfyWorkflowPack(inputs, {
          autoMapModels: autoMap,
          selectFirst: true,
        });
        if (result.created === 0) {
          setError(result.imported[0]?.errorDetail || result.imported[0]?.error || result.summary);
          return;
        }
        setStatus(result.summary);
        onImported?.(result.summary, result);
        markOnboardingSystemWorkflowsEnabled();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Pack import failed.');
      } finally {
        setBusy(false);
        if (inputRef.current) {
          inputRef.current.value = '';
        }
      }
    },
    [autoMap, onImported]
  );

  return (
    <div className={`space-y-2 ${className ?? ''}`.trim()}>
      {!compact ? (
        <p className="type-caption text-[var(--text-muted)]">
          Import real Comfy packs: {kindHint}. Placeholders bind automatically; media tokens (
          {'{{AUDIO_SECONDS}}'} / {'{{MESH_RESOLUTION}}'} / video frames) are attached when the
          graph matches.
        </p>
      ) : (
        <p className="type-caption text-[var(--text-muted)]">{kindHint}</p>
      )}
      <label className="flex cursor-pointer items-start gap-2 text-xs text-[var(--text-secondary)]">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={autoMap}
          onChange={event => setAutoMap(event.target.checked)}
        />
        <span>Auto-map imported graphs to suggested models (from filename + node types)</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json,application/zip,.zip"
          multiple
          className="hidden"
          onChange={event => void runImport(event.target.files)}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Importing…' : 'Import Comfy pack'}
        </Button>
      </div>
      {status ? (
        <p className="type-caption text-[var(--tint-success-text,var(--accent-text))]">{status}</p>
      ) : null}
      {error ? <p className="type-caption whitespace-pre-wrap ui-status-danger">{error}</p> : null}
    </div>
  );
}
