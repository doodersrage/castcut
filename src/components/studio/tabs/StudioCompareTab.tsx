'use client';

import dynamic from 'next/dynamic';
import type { SharedToolSettings, StudioToolCache } from '@/lib/settings-cache';
import type { EnrichedToolGenerateResult } from '@/lib/specialized/types';
import type { VisualCompareResult } from '@/lib/visual-model-compare';
import {
  ToolContentPanel,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import type { ToolAccent } from '@/lib/tool-theme';
import { FieldLabel, TextArea, TextInput } from '@/components/ui/Field';
import { Button, PrimaryButton } from '@/components/ui/Button';
import {
  CompareCardsSkeleton,
  EmptyState,
  ErrorState,
  StudioTabSkeleton,
} from '@/components/ui/ViewState';

const SharedToolControls = dynamic(() => import('@/components/SharedToolControls'), {
  ssr: false,
  loading: () => (
    <div className="h-40 animate-pulse rounded-2xl bg-[var(--surface-muted)]/50" aria-hidden />
  ),
});

const PromptDiagnosticsPanel = dynamic(() => import('@/components/PromptDiagnosticsPanel'), {
  loading: () => <StudioTabSkeleton />,
});

export type StudioCompareTabProps = {
  accent: ToolAccent;
  shared: SharedToolSettings;
  toolSettings: StudioToolCache;
  compareHints: string;
  compareA: EnrichedToolGenerateResult | null;
  compareB: EnrichedToolGenerateResult | null;
  compareLoading: boolean;
  compareError: string | null;
  visualCompareLoading: boolean;
  visualCompareStatus: string | null;
  visualA: VisualCompareResult | null;
  visualB: VisualCompareResult | null;
  onCompareHintsChange: (value: string) => void;
  onUpdateShared: (partial: Partial<SharedToolSettings>) => void;
  onUpdateToolSettings: (partial: Partial<StudioToolCache>) => void;
  onRunCompare: () => void | Promise<void>;
  onRunVisualCompare: () => void | Promise<void>;
};

function CompareCard({ title, result }: { title: string; result: EnrichedToolGenerateResult }) {
  return (
    <ToolContentPanel className="ui-block-group">
      <h3 className="type-title ui-truncate">{title}</h3>
      <pre className="type-code max-h-72 overflow-auto whitespace-pre-wrap border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-5 !text-[var(--tint-success-text)]">
        {result.prompt}
      </pre>
      <PromptDiagnosticsPanel diagnostics={result.diagnostics ?? null} />
    </ToolContentPanel>
  );
}

export default function StudioCompareTab({
  accent,
  shared,
  toolSettings,
  compareHints,
  compareA,
  compareB,
  compareLoading,
  compareError,
  visualCompareLoading,
  visualCompareStatus,
  visualA,
  visualB,
  onCompareHintsChange,
  onUpdateShared,
  onUpdateToolSettings,
  onRunCompare,
  onRunVisualCompare,
}: StudioCompareTabProps) {
  return (
    <ToolSection>
      <SharedToolControls
        shared={shared}
        onModelChange={model => onUpdateShared({ model })}
        onDetailChange={detail => onUpdateShared({ detail })}
        onWorkflowPresetChange={id => onUpdateShared({ selectedWorkflowFileId: id })}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <FieldLabel>Model A</FieldLabel>
          <p className="text-xs text-[var(--text-muted)]">{shared.model}</p>
        </div>
        <div className="space-y-2">
          <FieldLabel>Model B</FieldLabel>
          <TextInput
            value={toolSettings.compareModelB ?? 'flux-2-klein'}
            onChange={event => onUpdateToolSettings({ compareModelB: event.target.value })}
          />
        </div>
      </div>

      <TextArea
        rows={3}
        value={compareHints}
        onChange={event => onCompareHintsChange(event.target.value)}
        className={accentFocusClass(accent)}
      />

      <PrimaryButton
        accentClassName={accentButtonClass(accent)}
        onClick={() => void onRunCompare()}
        loading={compareLoading}
        loadingLabel="Comparing models"
      >
        Compare models
      </PrimaryButton>

      <Button
        variant="secondary"
        loading={visualCompareLoading}
        loadingLabel="Rendering compare"
        disabled={!compareA?.prompt}
        onClick={() => void onRunVisualCompare()}
      >
        Visual compare (ComfyUI)
      </Button>
      {visualCompareStatus ? (
        <p className="text-xs text-[var(--accent-text)]">{visualCompareStatus}</p>
      ) : null}

      {compareError && (
        <ErrorState
          compact
          title="Comparison failed"
          description={compareError}
          action={{
            label: 'Try again',
            onClick: () => void onRunCompare(),
          }}
        />
      )}

      {compareLoading ? (
        <CompareCardsSkeleton />
      ) : compareA || compareB ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {compareA && <CompareCard title={`Model A · ${shared.model}`} result={compareA} />}
          {compareB && (
            <CompareCard title={`Model B · ${toolSettings.compareModelB}`} result={compareB} />
          )}
        </div>
      ) : (
        <EmptyState
          branded
          icon="compare"
          title="Run a side-by-side comparison"
          description="Enter shared hints above, choose Model B, then compare how each architecture writes the same duo scene."
          action={{
            label: 'Compare models',
            onClick: () => void onRunCompare(),
          }}
        />
      )}

      {(visualA?.previewUrl ||
        visualB?.previewUrl ||
        visualA?.held ||
        visualB?.held ||
        visualA?.error ||
        visualB?.error) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {visualA ? (
            <div className="space-y-2">
              <p className="text-xs text-[var(--text-secondary)]">Visual · {visualA.model}</p>
              {visualA.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={visualA.previewUrl}
                  alt={`Visual compare ${visualA.model}`}
                  className="w-full rounded-xl border border-[var(--border-subtle)]"
                />
              ) : (
                <p className="text-sm text-[var(--tint-warning-text)]">
                  {visualA.held
                    ? 'Held Best until ComfyUI is idle'
                    : (visualA.error ?? 'No preview')}
                </p>
              )}
            </div>
          ) : null}
          {visualB ? (
            <div className="space-y-2">
              <p className="text-xs text-[var(--text-secondary)]">Visual · {visualB.model}</p>
              {visualB.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={visualB.previewUrl}
                  alt={`Visual compare ${visualB.model}`}
                  className="w-full rounded-xl border border-[var(--border-subtle)]"
                />
              ) : (
                <p className="text-sm text-[var(--tint-warning-text)]">
                  {visualB.held
                    ? 'Held Best until ComfyUI is idle'
                    : (visualB.error ?? 'No preview')}
                </p>
              )}
            </div>
          ) : null}
        </div>
      )}
    </ToolSection>
  );
}
