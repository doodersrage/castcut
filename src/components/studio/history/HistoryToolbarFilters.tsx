'use client';

import {
  loadHistorySavedViews,
  upsertHistorySavedView,
  deleteHistorySavedView,
  type HistorySavedView,
} from '@/lib/history-saved-views';
import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import type { HistoryFilter } from '@/lib/history-filter';
import type { PromptProject } from '@/lib/prompt-projects';
import type { ToolAccent } from '@/lib/tool-theme';
import { accentFocusClass } from '@/components/ui/ToolPageShell';
import { FieldLabel } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

type HistoryToolbarFiltersProps = {
  accent: ToolAccent;
  entries: PromptHistoryEntry[];
  filteredEntries: PromptHistoryEntry[];
  historyFilter: HistoryFilter;
  onHistoryFilterChange: React.Dispatch<React.SetStateAction<HistoryFilter>>;
  projects: PromptProject[];
  activeProjectId?: string;
  onActiveProjectChange: (projectId: string | undefined) => void;
  onAddTagToEntries?: (ids: string[], tag: string) => void;
  onBackupStatusChange: (status: string | null) => void;
  bulkTagDraft: string;
  onBulkTagDraftChange: (value: string) => void;
  savedViews: HistorySavedView[];
  onSavedViewsChange: (views: HistorySavedView[]) => void;
  viewNameDraft: string;
  onViewNameDraftChange: (value: string) => void;
  historyToolOptions: string[];
  historyModelOptions: string[];
  historyTagOptions: string[];
};

export default function HistoryToolbarFilters({
  accent,
  entries,
  filteredEntries,
  historyFilter,
  onHistoryFilterChange,
  projects,
  activeProjectId,
  onActiveProjectChange,
  onAddTagToEntries,
  onBackupStatusChange,
  bulkTagDraft,
  onBulkTagDraftChange,
  savedViews,
  onSavedViewsChange,
  viewNameDraft,
  onViewNameDraftChange,
  historyToolOptions,
  historyModelOptions,
  historyTagOptions,
}: HistoryToolbarFiltersProps) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 pt-2 sm:grid-cols-2 xl:grid-cols-3">
      <div className="space-y-2">
        <FieldLabel htmlFor="history-search">Search</FieldLabel>
        <input
          id="history-search"
          value={historyFilter.query ?? ''}
          onChange={event =>
            onHistoryFilterChange(previous => ({
              ...previous,
              query: event.target.value || undefined,
            }))
          }
          placeholder="prompt, hints, tool…"
          className="ui-input px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
        />
      </div>
      <div className="space-y-2">
        <FieldLabel htmlFor="history-tool">Tool</FieldLabel>
        <select
          id="history-tool"
          value={historyFilter.tool ?? 'all'}
          onChange={event =>
            onHistoryFilterChange(previous => ({
              ...previous,
              tool: event.target.value === 'all' ? undefined : event.target.value,
            }))
          }
          className="ui-input px-3 py-[var(--input-padding-y)] type-body"
        >
          <option value="all">All tools</option>
          {historyToolOptions.map(tool => (
            <option key={tool} value={tool}>
              {tool}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <FieldLabel htmlFor="history-model">Model</FieldLabel>
        <select
          id="history-model"
          value={historyFilter.model ?? 'all'}
          onChange={event =>
            onHistoryFilterChange(previous => ({
              ...previous,
              model: event.target.value === 'all' ? undefined : event.target.value,
            }))
          }
          className="ui-input px-3 py-[var(--input-padding-y)] type-body"
        >
          <option value="all">All models</option>
          {historyModelOptions.map(model => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <FieldLabel htmlFor="history-tag">Tag</FieldLabel>
        <select
          id="history-tag"
          value={historyFilter.tag ?? 'all'}
          onChange={event =>
            onHistoryFilterChange(previous => ({
              ...previous,
              tag: event.target.value === 'all' ? undefined : event.target.value,
            }))
          }
          className="ui-input px-3 py-[var(--input-padding-y)] type-body"
        >
          <option value="all">All tags</option>
          {historyTagOptions.map(tag => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-3 self-end pb-1 type-body">
        <input
          type="checkbox"
          checked={historyFilter.semanticSearch === true}
          onChange={event =>
            onHistoryFilterChange(previous => ({
              ...previous,
              semanticSearch: event.target.checked || undefined,
            }))
          }
          className={`h-4 w-4 rounded-[var(--radius-sm)] ${accentFocusClass(accent)}`}
        />
        Semantic search
      </label>
      {projects.length > 0 && (
        <div className="space-y-2">
          <FieldLabel htmlFor="history-project">Project</FieldLabel>
          <select
            id="history-project"
            value={activeProjectId ?? 'all'}
            onChange={event => {
              const value = event.target.value === 'all' ? undefined : event.target.value;
              onActiveProjectChange(value);
            }}
            className="ui-input px-3 py-[var(--input-padding-y)] type-body"
          >
            <option value="all">All projects</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <label className="flex items-center gap-3 self-end pb-1 type-body">
        <input
          type="checkbox"
          checked={historyFilter.favoritesOnly === true}
          onChange={event =>
            onHistoryFilterChange(previous => ({
              ...previous,
              favoritesOnly: event.target.checked || undefined,
            }))
          }
          className={`h-4 w-4 rounded-[var(--radius-sm)] ${accentFocusClass(accent)}`}
        />
        Favorites only
      </label>
      <label className="flex items-center gap-3 self-end pb-1 type-body">
        <input
          type="checkbox"
          checked={historyFilter.videoOnly === true}
          onChange={event =>
            onHistoryFilterChange(previous => ({
              ...previous,
              videoOnly: event.target.checked || undefined,
            }))
          }
          className={`h-4 w-4 rounded-[var(--radius-sm)] ${accentFocusClass(accent)}`}
        />
        Video lineage only
      </label>
      <div className="flex flex-wrap items-end gap-2 sm:col-span-2 xl:col-span-3">
        <div className="min-w-[10rem] flex-1 space-y-2">
          <FieldLabel htmlFor="history-saved-view-name">Saved filter</FieldLabel>
          <input
            id="history-saved-view-name"
            value={viewNameDraft}
            onChange={event => onViewNameDraftChange(event.target.value)}
            placeholder="Batch keepers, video drafts…"
            className="ui-input px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const name = viewNameDraft.trim() || `Filter ${savedViews.length + 1}`;
            upsertHistorySavedView({
              id: `history-view-${Date.now().toString(36)}`,
              name,
              filter: historyFilter,
            });
            onSavedViewsChange(loadHistorySavedViews());
            onViewNameDraftChange('');
            onBackupStatusChange(`Saved history filter “${name}”.`);
          }}
        >
          Save filter
        </Button>
        {savedViews.map(view => (
          <div key={view.id} className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onHistoryFilterChange(view.filter);
                onBackupStatusChange(`Applied filter “${view.name}”.`);
              }}
            >
              {view.name}
            </Button>
            <button
              type="button"
              aria-label={`Delete saved filter ${view.name}`}
              className="rounded px-1 text-xs text-[var(--text-muted)] hover:text-[var(--tint-danger-text)]"
              onClick={() => {
                deleteHistorySavedView(view.id);
                onSavedViewsChange(loadHistorySavedViews());
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {filteredEntries.length > 0 && onAddTagToEntries ? (
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 xl:col-span-3">
          <div className="min-w-[10rem] flex-1 space-y-2">
            <FieldLabel htmlFor="history-bulk-tag">Tag filtered</FieldLabel>
            <input
              id="history-bulk-tag"
              value={bulkTagDraft}
              onChange={event => onBulkTagDraftChange(event.target.value)}
              placeholder="batch, keeper, …"
              className="ui-input px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={!bulkTagDraft.trim()}
            onClick={() => {
              const tag = bulkTagDraft.trim();
              if (!tag) {
                return;
              }
              onAddTagToEntries(
                filteredEntries.map(entry => entry.id),
                tag
              );
              onBulkTagDraftChange('');
              onBackupStatusChange(`Tagged ${filteredEntries.length} entries “${tag}”.`);
            }}
          >
            Apply to {filteredEntries.length}
          </Button>
        </div>
      ) : null}
      <div className="space-y-2">
        <FieldLabel htmlFor="history-rating">Min rating</FieldLabel>
        <select
          id="history-rating"
          value={historyFilter.minRating ?? 0}
          onChange={event => {
            const value = Number(event.target.value);
            onHistoryFilterChange(previous => ({
              ...previous,
              minRating: value > 0 ? value : undefined,
            }));
          }}
          className="ui-input px-3 py-[var(--input-padding-y)] type-body"
        >
          <option value={0}>Any</option>
          {[1, 2, 3, 4, 5].map(rating => (
            <option key={rating} value={rating}>
              {rating}+ stars
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
