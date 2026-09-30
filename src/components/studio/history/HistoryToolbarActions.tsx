'use client';

import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import { Button } from '@/components/ui/Button';
import {
  downloadTextFile,
  exportHistoryCsv,
  exportHistoryJsonl,
} from '@/lib/history-export-formats';

type HistoryToolbarActionsProps = {
  entries: PromptHistoryEntry[];
  filteredEntries: PromptHistoryEntry[];
  favoriteEntries: PromptHistoryEntry[];
  onSendBatchFavorites: (prompts: string[]) => void;
  onClearHistory: () => void;
  onRemoveEntries?: (ids: string[]) => void;
  onImportBackup: (file: File) => void | Promise<void>;
  onBackupStatusChange: (status: string | null) => void;
};

export default function HistoryToolbarActions({
  entries,
  filteredEntries,
  favoriteEntries,
  onSendBatchFavorites,
  onClearHistory,
  onRemoveEntries,
  onImportBackup,
  onBackupStatusChange,
}: HistoryToolbarActionsProps) {
  return (
    <div className="ui-list-actions w-full justify-start lg:w-auto lg:justify-end">
      {favoriteEntries.length > 0 && (
        <Button
          variant="accent-outline"
          size="sm"
          onClick={() => onSendBatchFavorites(favoriteEntries.map(entry => entry.prompt))}
        >
          Queue favorites ({favoriteEntries.length})
        </Button>
      )}
      {/* Eight file actions stacked into a tall column on phones — one menu keeps the list in
          view. */}
      <details className="relative" data-testid="history-file-menu">
        <summary className="ui-btn-ghost ui-btn-sm cursor-pointer list-none px-3 [&::-webkit-details-marker]:hidden">
          Export &amp; backup ▾
        </summary>
        <div className="absolute left-0 z-30 mt-1 flex min-w-[12rem] lg:left-auto lg:right-0 flex-col items-stretch gap-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1 shadow-lg [&>*]:justify-start">
          {entries.length > 0 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  downloadTextFile(
                    exportHistoryCsv(filteredEntries),
                    'history-filtered.csv',
                    'text/csv;charset=utf-8'
                  )
                }
              >
                Export CSV
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  downloadTextFile(
                    exportHistoryJsonl(filteredEntries),
                    'history-filtered.jsonl',
                    'application/jsonl;charset=utf-8'
                  )
                }
              >
                Export JSONL
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void import('@/lib/studio-backup').then(({ downloadHistoryExport }) => {
                    downloadHistoryExport(filteredEntries);
                  });
                }}
              >
                Export filtered
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void import('@/lib/studio-backup').then(({ downloadHistoryExport }) => {
                    downloadHistoryExport(entries);
                  });
                }}
              >
                Export all
              </Button>
              <Button variant="ghost" size="sm" onClick={onClearHistory}>
                Clear all
              </Button>
              {filteredEntries.length > 0 &&
              filteredEntries.length !== entries.length &&
              onRemoveEntries ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete ${filteredEntries.length} filtered entries? This cannot be undone.`
                      )
                    ) {
                      onRemoveEntries(filteredEntries.map(entry => entry.id));
                      onBackupStatusChange(`Removed ${filteredEntries.length} filtered entries.`);
                    }
                  }}
                >
                  Delete filtered ({filteredEntries.length})
                </Button>
              ) : null}
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void import('@/lib/studio-backup').then(({ downloadStudioBackup }) => {
                downloadStudioBackup();
                onBackupStatusChange('Studio backup downloaded.');
              });
            }}
          >
            Export backup
          </Button>
          <label className="ui-btn-ghost ui-btn-sm ui-file-input-label cursor-pointer px-4">
            Import backup
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) {
                  void onImportBackup(file);
                }
                event.target.value = '';
              }}
            />
          </label>
        </div>
      </details>
    </div>
  );
}
