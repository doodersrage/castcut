'use client';

import ComfyPackImportControl from '@/components/ComfyPackImportControl';
import { Button } from '@/components/ui/Button';
import { ChipButton, TextInput } from '@/components/ui/Field';
import { ToolActionRow } from '@/components/ui/ToolPageShell';
import type { ComfyWorkflowLibraryViewModel } from '@/hooks/useComfyWorkflowLibrary';

type Props = ComfyWorkflowLibraryViewModel;

export function ComfyWorkflowLibraryToolbarSection({
  newName,
  setNewName,
  selectedId,
  editingJson,
  importError,
  importErrorDetail,
  importNotice,
  optimizePreviewSummary,
  selectFile,
  importFile,
  createBlank,
  createScaffoldForModel,
  createControlNetScaffold,
  createFaceDetailerScaffold,
  createIdentityScaffold,
  cloneAndBindWorkflow,
  previewOptimizeCopy,
  optimizeAndSaveCopy,
  optimizeAllInLibrary,
  handlePackImport,
}: Props) {
  return (
    <>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
        <p className="type-heading mb-2">Import Comfy pack</p>
        <ComfyPackImportControl onImported={handlePackImport} />
      </div>

      <ToolActionRow>
        <TextInput
          value={newName}
          onChange={event => setNewName(event.target.value)}
          placeholder="Name for new/imported workflow"
          className="min-w-[14rem] flex-1"
        />
        <label className="ui-file-input-label ui-btn-secondary ui-btn-sm">
          Import .json
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) {
                void importFile(file);
              }
              event.target.value = '';
            }}
          />
        </label>
        <Button type="button" variant="secondary" size="sm" onClick={createBlank}>
          New workflow
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={createScaffoldForModel}>
          Scaffold for model
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={createControlNetScaffold}>
          ControlNet scaffold
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={createFaceDetailerScaffold}>
          FaceDetailer scaffold
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => createIdentityScaffold('instantid')}
        >
          InstantID scaffold
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => createIdentityScaffold('pulid')}
        >
          PuLID scaffold
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={cloneAndBindWorkflow}
          disabled={!editingJson.trim()}
        >
          Clone &amp; bind
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={previewOptimizeCopy}
          disabled={!editingJson.trim()}
        >
          Preview optimize
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={optimizeAndSaveCopy}
          disabled={!editingJson.trim()}
        >
          Optimize &amp; save copy
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={optimizeAllInLibrary}>
          Optimize all in library
        </Button>
        <ChipButton active={!selectedId} onClick={() => selectFile(undefined, '')}>
          Use fallback default
        </ChipButton>
      </ToolActionRow>
      <p className="mb-4 text-xs text-[var(--text-muted)]">
        After importing community JSON, run{' '}
        <strong className="font-medium text-[var(--text-muted)]">Optimize all in library</strong> so
        placeholders bind to your checkpoint/VAE maps and queue can skip re-bind/enrich via a fresh
        hash. Confirm filenames match ComfyUI&apos;s model lists. Workflow Health flags missing or
        stale optimize hashes.
      </p>

      {importError ? (
        <div
          className="space-y-1 rounded-xl border border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] px-3 py-2.5"
          role="alert"
        >
          <p className="type-caption ui-status-danger">{importError}</p>
          {importErrorDetail ? (
            <p className="type-caption whitespace-pre-wrap ui-status-danger opacity-80">
              {importErrorDetail}
            </p>
          ) : null}
        </div>
      ) : null}
      {importNotice ? (
        <p className="type-caption text-[var(--tint-warning-text)]">{importNotice}</p>
      ) : null}
      {optimizePreviewSummary ? (
        <p className="type-caption text-[var(--accent-text)]">{optimizePreviewSummary}</p>
      ) : null}
    </>
  );
}
