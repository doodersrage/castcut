'use client';

import BatchLintGatePanel from '@/components/BatchLintGatePanel';
import BatchReadinessPanel, {
  applyReadinessFilterToPrompts,
} from '@/components/BatchReadinessPanel';
import BatchQueueProgress from '@/components/BatchQueueProgress';
import SidecarImportButton from '@/components/SidecarImportButton';
import { batchFixPrompts, filterBatchByLintIndexes } from '@/lib/batch-lint-gate';
import type { PromptSidecar } from '@/lib/prompt-sidecar';
import { rollVariationLabel } from '@/lib/tool-ui-labels';
import { accentButtonClass, accentRingClass } from '@/components/ui/ToolPageShell';
import { FieldError, FieldLabel } from '@/components/ui/Field';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { VARIATION_GRID_ACCENT } from '@/components/variations/variation-grid-shared';
import type { useVariationGridOrchestration } from '@/hooks/useVariationGridOrchestration';

type Props = Pick<
  ReturnType<typeof useVariationGridOrchestration>,
  | 'shared'
  | 'toolSettings'
  | 'updateShared'
  | 'updateToolSettings'
  | 'updateToolSettings'
  | 'results'
  | 'setResults'
  | 'loading'
  | 'queueLoading'
  | 'error'
  | 'status'
  | 'comfyStatus'
  | 'importStatus'
  | 'setImportStatus'
  | 'lintSummary'
  | 'setLintSummary'
  | 'lintLoading'
  | 'readyOnly'
  | 'setReadyOnly'
  | 'queueProgress'
  | 'rollProgress'
  | 'hintSource'
  | 'historyCandidateCount'
  | 'gridMode'
  | 'count'
  | 'matrixRowCount'
  | 'matrixColCount'
  | 'rollGrid'
  | 'rollMatrix'
  | 'executeQueue'
  | 'queueGrid'
>;

export function VariationGridActionsSection({
  shared,
  toolSettings,
  updateShared,
  updateToolSettings,
  results,
  setResults,
  loading,
  queueLoading,
  error,
  status,
  comfyStatus,
  importStatus,
  setImportStatus,
  lintSummary,
  setLintSummary,
  lintLoading,
  readyOnly,
  setReadyOnly,
  queueProgress,
  rollProgress,
  hintSource,
  historyCandidateCount,
  gridMode,
  count,
  matrixRowCount,
  matrixColCount,
  rollGrid,
  rollMatrix,
  executeQueue,
  queueGrid,
}: Props) {
  return (
    <>
      <div className="space-y-1">
        <FieldLabel>
          Variation strength ({rollVariationLabel(toolSettings.variationStrength ?? 65)})
        </FieldLabel>
        <input
          type="range"
          aria-label="Variation strength"
          min={0}
          max={100}
          value={toolSettings.variationStrength ?? 65}
          onChange={event => updateToolSettings({ variationStrength: Number(event.target.value) })}
          className={`w-full ${accentRingClass(VARIATION_GRID_ACCENT)}`}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <PrimaryButton
          accentClassName={accentButtonClass(VARIATION_GRID_ACCENT)}
          loading={loading}
          loadingLabel={gridMode === 'matrix' ? 'Rolling matrix' : 'Rolling variations'}
          disabled={
            gridMode === 'imported' ||
            (hintSource === 'history' && historyCandidateCount === 0) ||
            (hintSource === 'manual' && !toolSettings.hints?.trim())
          }
          onClick={() => void (gridMode === 'matrix' ? rollMatrix() : rollGrid())}
          data-action="primary-generate"
        >
          {gridMode === 'matrix'
            ? `Roll matrix (${matrixRowCount}×${matrixColCount})`
            : `Roll ${count} variations`}
        </PrimaryButton>
        <Button
          variant="accent-outline"
          loading={queueLoading || lintLoading}
          loadingLabel={lintLoading ? 'Linting batch' : 'Queueing variations'}
          disabled={results.every(entry => !entry.prompt)}
          onClick={() => void queueGrid()}
        >
          Queue grid to ComfyUI
        </Button>
        <SidecarImportButton
          label="Import sidecar hints"
          className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-default)]"
          onImport={(sidecar: PromptSidecar) => {
            updateToolSettings({
              hints: sidecar.hints?.trim() || sidecar.positive.slice(0, 400),
            });
            if (sidecar.variationSeed) {
              updateShared({ lockedVariationSeed: sidecar.variationSeed });
            }
            setImportStatus(`Loaded sidecar · ${sidecar.tool ?? 'unknown'} · ${sidecar.model}`);
          }}
          onError={setImportStatus}
        />
      </div>

      {importStatus && <p className="text-sm text-[var(--text-muted)]">{importStatus}</p>}
      {status && <p className="text-sm text-[var(--text-muted)]">{status}</p>}
      <BatchLintGatePanel
        summary={lintSummary}
        loading={lintLoading}
        onFixAll={() => {
          const prompts = results.map(entry => entry.prompt);
          void batchFixPrompts(prompts, toolSettings.hints).then(fixed => {
            setResults(previous =>
              previous.map((entry, index) => ({
                ...entry,
                prompt: fixed[index] ?? entry.prompt,
              }))
            );
            setLintSummary(null);
          });
        }}
        onContinue={() => {
          let prompts = results.map(entry => entry.prompt.trim()).filter(Boolean);
          if (lintSummary && lintSummary.blockedIndexes.length > 0) {
            prompts = filterBatchByLintIndexes(prompts, lintSummary.blockedIndexes);
          }
          prompts = applyReadinessFilterToPrompts(
            prompts,
            results.map(entry => ({
              prompt: entry.prompt,
              label: entry.rowLabel,
              hints: toolSettings.hints,
            })),
            shared.model,
            shared.detail,
            readyOnly
          );
          void executeQueue(prompts);
        }}
        onCancel={() => setLintSummary(null)}
      />
      <BatchReadinessPanel
        rows={results.map(entry => ({
          prompt: entry.prompt,
          label:
            entry.rowLabel && entry.colLabel
              ? `${entry.rowLabel} × ${entry.colLabel}`
              : entry.rowLabel,
          hints: toolSettings.hints,
        }))}
        model={shared.model}
        detail={shared.detail}
        onFilterReadyOnlyChange={setReadyOnly}
      />
      <BatchQueueProgress progress={rollProgress} />
      <BatchQueueProgress progress={queueProgress} />
      {comfyStatus && <p className="text-sm text-[var(--accent-text)]/90">{comfyStatus}</p>}
      <FieldError>{error}</FieldError>
    </>
  );
}
