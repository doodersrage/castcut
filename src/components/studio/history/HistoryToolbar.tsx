'use client';

import type { HistorySavedView } from '@/lib/history-saved-views';
import type { HistoryFilter } from '@/lib/history-filter';
import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import type { PromptProject } from '@/lib/prompt-projects';
import { ToolMetaPanel } from '@/components/ui/ToolPageShell';
import type { ToolAccent } from '@/lib/tool-theme';
import type { HistoryDensity } from '@/lib/history-density';
import type { HistoryPageSize } from '@/lib/history-pagination';
import HistoryToolbarActions from '@/components/studio/history/HistoryToolbarActions';
import HistoryToolbarFilters from '@/components/studio/history/HistoryToolbarFilters';

export type HistoryToolbarProps = {
  accent: ToolAccent;
  entries: PromptHistoryEntry[];
  filteredEntries: PromptHistoryEntry[];
  favoriteEntries: PromptHistoryEntry[];
  historyFilter: HistoryFilter;
  onHistoryFilterChange: React.Dispatch<React.SetStateAction<HistoryFilter>>;
  projects: PromptProject[];
  activeProjectId?: string;
  onActiveProjectChange: (projectId: string | undefined) => void;
  density: HistoryDensity;
  onDensityChange: (density: HistoryDensity) => void;
  pageSize: HistoryPageSize;
  useVirtualHistory: boolean;
  paginationPage: number;
  paginationTotalPages: number;
  onSendBatchFavorites: (prompts: string[]) => void;
  onClearHistory: () => void;
  onRemoveEntries?: (ids: string[]) => void;
  onAddTagToEntries?: (ids: string[], tag: string) => void;
  onImportBackup: (file: File) => void | Promise<void>;
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

export default function HistoryToolbar({
  accent,
  entries,
  filteredEntries,
  favoriteEntries,
  historyFilter,
  onHistoryFilterChange,
  projects,
  activeProjectId,
  onActiveProjectChange,
  density,
  onDensityChange,
  pageSize,
  useVirtualHistory,
  paginationPage,
  paginationTotalPages,
  onSendBatchFavorites,
  onClearHistory,
  onRemoveEntries,
  onAddTagToEntries,
  onImportBackup,
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
}: HistoryToolbarProps) {
  return (
    <ToolMetaPanel>
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <p className="type-heading shrink-0">
          {filteredEntries.length}
          {filteredEntries.length !== entries.length ? ` of ${entries.length}` : ''} entries
          {!useVirtualHistory && filteredEntries.length > pageSize
            ? ` · page ${paginationPage}/${paginationTotalPages}`
            : ''}
        </p>
        <div className="flex min-w-0 flex-col gap-3 lg:items-end">
          <div className="flex items-center gap-1 rounded-full border border-[var(--border-subtle)] p-0.5">
            {(
              [
                ['comfortable', 'Comfortable'],
                ['compact', 'Compact'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={density === value}
                className={`rounded-full px-2.5 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                  density === value
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
                onClick={() => {
                  onDensityChange(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <HistoryToolbarActions
            entries={entries}
            filteredEntries={filteredEntries}
            favoriteEntries={favoriteEntries}
            onSendBatchFavorites={onSendBatchFavorites}
            onClearHistory={onClearHistory}
            onRemoveEntries={onRemoveEntries}
            onImportBackup={onImportBackup}
            onBackupStatusChange={onBackupStatusChange}
          />
        </div>
      </div>

      <HistoryToolbarFilters
        accent={accent}
        entries={entries}
        filteredEntries={filteredEntries}
        historyFilter={historyFilter}
        onHistoryFilterChange={onHistoryFilterChange}
        projects={projects}
        activeProjectId={activeProjectId}
        onActiveProjectChange={onActiveProjectChange}
        onAddTagToEntries={onAddTagToEntries}
        onBackupStatusChange={onBackupStatusChange}
        bulkTagDraft={bulkTagDraft}
        onBulkTagDraftChange={onBulkTagDraftChange}
        savedViews={savedViews}
        onSavedViewsChange={onSavedViewsChange}
        viewNameDraft={viewNameDraft}
        onViewNameDraftChange={onViewNameDraftChange}
        historyToolOptions={historyToolOptions}
        historyModelOptions={historyModelOptions}
        historyTagOptions={historyTagOptions}
      />
    </ToolMetaPanel>
  );
}
