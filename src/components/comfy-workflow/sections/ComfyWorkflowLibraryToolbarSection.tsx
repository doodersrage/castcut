'use client';

import ComfyPackImportControl from '@/components/ComfyPackImportControl';
import { Button } from '@/components/ui/Button';
import { ChipButton, SelectInput, TextInput } from '@/components/ui/Field';
import { ToolActionRow } from '@/components/ui/ToolPageShell';
import type { ComfyWorkflowLibraryViewModel } from '@/hooks/useComfyWorkflowLibrary';

type Props = ComfyWorkflowLibraryViewModel;

type AddAction = 'blank' | 'model' | 'controlnet' | 'facedetailer' | 'instantid' | 'pulid';
type AddHandlers = Pick<
  Props,
  | 'createBlank'
  | 'createScaffoldForModel'
  | 'createControlNetScaffold'
  | 'createFaceDetailerScaffold'
  | 'createIdentityScaffold'
>;

/** One "Add workflow…" menu instead of six scaffold buttons. */
const ADD_ACTIONS: Record<AddAction, (handlers: AddHandlers) => void> = {
  blank: handlers => handlers.createBlank(),
  model: handlers => handlers.createScaffoldForModel(),
  controlnet: handlers => handlers.createControlNetScaffold(),
  facedetailer: handlers => handlers.createFaceDetailerScaffold(),
  instantid: handlers => handlers.createIdentityScaffold('instantid'),
  pulid: handlers => handlers.createIdentityScaffold('pulid'),
};

export function ComfyWorkflowLibraryToolbarSection({
  newName,
  setNewName,
  selectedId,
  importError,
  importErrorDetail,
  importNotice,
  selectFile,
  importFile,
  createBlank,
  createScaffoldForModel,
  createControlNetScaffold,
  createFaceDetailerScaffold,
  createIdentityScaffold,
  optimizeAllInLibrary,
  handlePackImport,
}: Props) {
  return (
    <>
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
        <SelectInput
          aria-label="Add a workflow"
          data-testid="workflow-library-add"
          className="max-w-[14rem] text-xs"
          value=""
          onChange={event => {
            const pick = event.target.value;
            event.target.value = '';
            ADD_ACTIONS[pick as AddAction]?.({
              createBlank,
              createScaffoldForModel,
              createControlNetScaffold,
              createFaceDetailerScaffold,
              createIdentityScaffold,
            });
          }}
        >
          <option value="">Add workflow…</option>
          <option value="blank">New blank workflow</option>
          <option value="model">Scaffold for current model</option>
          <option value="controlnet">ControlNet scaffold</option>
          <option value="facedetailer">FaceDetailer scaffold</option>
          <option value="instantid">InstantID scaffold</option>
          <option value="pulid">PuLID scaffold</option>
        </SelectInput>
        <Button type="button" variant="secondary" size="sm" onClick={optimizeAllInLibrary}>
          Optimize all in library
        </Button>
        <ChipButton active={!selectedId} onClick={() => selectFile(undefined, '')}>
          Use fallback default
        </ChipButton>
      </ToolActionRow>
      <details className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2">
        <summary className="type-caption cursor-pointer text-[var(--text-secondary)]">
          Import Comfy pack
        </summary>
        <div className="pt-2">
          <ComfyPackImportControl onImported={handlePackImport} />
        </div>
      </details>
      <p className="mb-4 text-xs text-[var(--text-muted)]">
        Imports and scaffolds are health-checked automatically. Clone &amp; bind and optimize a
        single workflow from its Edit JSON panel.
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
    </>
  );
}
