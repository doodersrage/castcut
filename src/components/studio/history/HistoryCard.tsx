'use client';

import dynamic from 'next/dynamic';
import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import type { HistoryDensity } from '@/lib/history-density';
import { buildRegenerateUrl } from '@/lib/regenerate-url';
import { buildUseAsHintsUrl } from '@/lib/use-as-hints-url';
import { studioHistoryUrl } from '@/lib/prompt-lineage';
import { startPromptEditorFromHistoryEntry } from '@/lib/improve-output';
import { ToolContentPanel, ToolMetaPanel } from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';
import ActionMenu, { ACTION_MENU_ITEM_CLASS } from '@/components/ui/ActionMenu';

const PromptDiagnosticsPanel = dynamic(() => import('@/components/PromptDiagnosticsPanel'), {
  loading: () => null,
});

export type HistoryCardProps = {
  entry: PromptHistoryEntry;
  highlighted?: boolean;
  density?: HistoryDensity;
  onCopy: () => void;
  onToggleFavorite: () => void;
  onRate: (rating: PromptHistoryEntry['rating']) => void;
  onAddTag: (tag: string) => void;
  onExportSidecar: () => void;
  onRemove: () => void;
  onDiffLeft: () => void;
  onDiffRight: () => void;
  onSaveTemplate: () => void;
  onRequeue: (newSeed: boolean) => void;
  onUpscale?: (qualityProfile: 'final' | 'max') => void;
  onRefine?: () => void;
  onOpenLinkedEdit?: (
    target:
      | 'refine'
      | 'inpaint'
      | 'outpaint'
      | 'compose'
      | 'video'
      | 'controlnet'
      | 'background'
      | 'imagePrompt'
  ) => void;
  onRequeueBatch?: () => void;
  batchPromptCount?: number;
  onPreview?: () => void;
};

function readHistoryBatchPrompts(entry: PromptHistoryEntry): string[] {
  const raw = entry.metadata?.batchPrompts;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export default function HistoryCard({
  entry,
  highlighted,
  density = 'comfortable',
  onCopy,
  onToggleFavorite,
  onRate,
  onAddTag,
  onExportSidecar,
  onRemove,
  onDiffLeft,
  onDiffRight,
  onSaveTemplate,
  onRequeue,
  onUpscale,
  onRefine,
  onOpenLinkedEdit,
  onRequeueBatch,
  batchPromptCount = 0,
  onPreview,
}: {
  entry: PromptHistoryEntry;
  highlighted?: boolean;
  density?: HistoryDensity;
  onCopy: () => void;
  onToggleFavorite: () => void;
  onRate: (rating: PromptHistoryEntry['rating']) => void;
  onAddTag: (tag: string) => void;
  onExportSidecar: () => void;
  onRemove: () => void;
  onDiffLeft: () => void;
  onDiffRight: () => void;
  onSaveTemplate: () => void;
  onRequeue: (newSeed: boolean) => void;
  onUpscale?: (qualityProfile: 'final' | 'max') => void;
  onRefine?: () => void;
  /** Open linked gallery output in an edit/media tool. */
  onOpenLinkedEdit?: (
    target:
      | 'refine'
      | 'inpaint'
      | 'outpaint'
      | 'compose'
      | 'video'
      | 'controlnet'
      | 'background'
      | 'imagePrompt'
  ) => void;
  onRequeueBatch?: () => void;
  batchPromptCount?: number;
  onPreview?: () => void;
}) {
  const regenerateUrl = buildRegenerateUrl(entry);
  const useAsHintsUrl = buildUseAsHintsUrl(entry);
  const showHintDiff =
    entry.hints?.trim() &&
    entry.prompt.trim() &&
    !entry.prompt.toLowerCase().includes(entry.hints.trim().slice(0, 40).toLowerCase());
  const compact = density === 'compact';

  return (
    <ToolContentPanel
      className={`ui-block-group min-w-0 ${highlighted ? 'ring-2 ring-[var(--accent-ring)]' : ''} ${
        compact ? '!gap-2' : ''
      }`}
    >
      <pre
        tabIndex={0}
        aria-label="Prompt"
        className={`type-code overflow-auto whitespace-pre-wrap border border-[var(--border-subtle)] bg-[var(--bg-muted)] !text-[var(--tint-success-text)] ${
          compact ? 'max-h-28 p-3 text-xs' : 'max-h-56 p-5'
        }`}
      >
        {entry.prompt}
      </pre>

      <ToolMetaPanel>
        <div className={`flex min-w-0 flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
          <p className="type-caption min-w-0 break-words text-[var(--text-muted)]">
            {entry.tool} · {entry.model} · {new Date(entry.timestamp).toLocaleString()}
          </p>
          {/* ~22 buttons per row buried the prompt — primary actions stay out, the rest
              sit one click deeper in "Open in" (tools) and "More" (queue extras, files). */}
          <div className={`ui-list-actions w-full justify-start ${compact ? 'gap-1.5' : ''}`}>
            <Button
              variant="accent-outline"
              size="sm"
              className="type-caption"
              onClick={() => onRequeue(false)}
            >
              Re-queue
            </Button>
            <Button
              variant="accent-outline"
              size="sm"
              className="type-caption"
              onClick={() => onRequeue(true)}
            >
              New seed
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="type-caption"
              onClick={() => startPromptEditorFromHistoryEntry(entry)}
            >
              Edit prompt
            </Button>
            <Button variant="ghost" size="sm" className="type-caption" onClick={onCopy}>
              Copy
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="type-caption"
              aria-label={entry.favorite ? 'Unfavorite' : 'Favorite'}
              onClick={onToggleFavorite}
            >
              {entry.favorite ? '★' : '☆'}
            </Button>
            <ActionMenu label="Open in" align="left">
              <a href={regenerateUrl} className={ACTION_MENU_ITEM_CLASS}>
                Regenerate
              </a>
              <a href={useAsHintsUrl} className={ACTION_MENU_ITEM_CLASS}>
                Use as hints
              </a>
              {onOpenLinkedEdit
                ? (
                    [
                      ['refine', 'Refine'],
                      ['inpaint', 'Inpaint'],
                      ['outpaint', 'Outpaint'],
                      ['compose', 'Compose'],
                      ['video', 'Video'],
                      ['controlnet', 'ControlNet'],
                      ['background', 'Background'],
                      ['imagePrompt', 'Image → Prompt'],
                    ] as const
                  ).map(([tool, label]) => (
                    <button
                      key={tool}
                      type="button"
                      className={ACTION_MENU_ITEM_CLASS}
                      onClick={() => onOpenLinkedEdit(tool)}
                    >
                      {label}
                    </button>
                  ))
                : null}
            </ActionMenu>
            <ActionMenu label="More" align="left">
              {onUpscale ? (
                <>
                  <button
                    type="button"
                    className={ACTION_MENU_ITEM_CLASS}
                    onClick={() => onUpscale('final')}
                  >
                    Upscale (Final)
                  </button>
                  <button
                    type="button"
                    className={ACTION_MENU_ITEM_CLASS}
                    onClick={() => onUpscale('max')}
                  >
                    Upscale (Max)
                  </button>
                </>
              ) : null}
              {onRefine ? (
                <button type="button" className={ACTION_MENU_ITEM_CLASS} onClick={onRefine}>
                  Refine (low denoise)
                </button>
              ) : null}
              {batchPromptCount > 1 && onRequeueBatch ? (
                <button type="button" className={ACTION_MENU_ITEM_CLASS} onClick={onRequeueBatch}>
                  Re-queue batch ({batchPromptCount})
                </button>
              ) : null}
              {onPreview ? (
                <button type="button" className={ACTION_MENU_ITEM_CLASS} onClick={onPreview}>
                  Preview
                </button>
              ) : null}
              <a href={studioHistoryUrl(entry.id)} className={ACTION_MENU_ITEM_CLASS}>
                Link
              </a>
              <button
                type="button"
                className={ACTION_MENU_ITEM_CLASS}
                onClick={() => {
                  const tag = window.prompt('Add tag');
                  if (tag?.trim()) {
                    onAddTag(tag.trim());
                  }
                }}
              >
                Tag
              </button>
              <button type="button" className={ACTION_MENU_ITEM_CLASS} onClick={onDiffLeft}>
                Diff A
              </button>
              <button type="button" className={ACTION_MENU_ITEM_CLASS} onClick={onDiffRight}>
                Diff B
              </button>
              <button type="button" className={ACTION_MENU_ITEM_CLASS} onClick={onSaveTemplate}>
                Save as template
              </button>
              <button type="button" className={ACTION_MENU_ITEM_CLASS} onClick={onExportSidecar}>
                Export sidecar
              </button>
              <button
                type="button"
                className={`${ACTION_MENU_ITEM_CLASS} !text-[var(--tint-danger-text)]`}
                onClick={onRemove}
              >
                Remove
              </button>
            </ActionMenu>
          </div>
        </div>

        {entry.hints?.trim() && (
          <p className="type-caption ui-truncate-2">
            Hints: <span className="text-[var(--text-secondary)]">{entry.hints}</span>
          </p>
        )}

        {(entry.tags?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2">
            {entry.tags!.map(tag => (
              <span
                key={tag}
                className="type-overline rounded-[var(--radius-full)] border border-[var(--border-default)] bg-[var(--bg-subtle)] px-2.5 py-1"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {showHintDiff && (
          <p className="type-caption text-[var(--tint-warning-text)]">
            Prompt expanded beyond the saved hints — use Regenerate to roll again with the same
            inputs.
          </p>
        )}

        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(value => (
            <button
              key={value}
              type="button"
              onClick={() => onRate(value as PromptHistoryEntry['rating'])}
              className={`ui-chip !min-h-8 !min-w-8 justify-center px-0 ${
                entry.rating === value ? '' : ''
              }`}
              data-active={entry.rating === value ? 'true' : 'false'}
            >
              {value}
            </button>
          ))}
        </div>

        {entry.diagnostics && <PromptDiagnosticsPanel diagnostics={entry.diagnostics} />}
      </ToolMetaPanel>
    </ToolContentPanel>
  );
}
