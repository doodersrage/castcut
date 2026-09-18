'use client';

import { Button } from '@/components/ui/Button';
import { ChipButton } from '@/components/ui/Field';
import {
  COMFY_ASSET_KIND_LABELS,
  COMFY_ASSET_KIND_ORDER,
  type ComfyAssetKind,
} from '@/lib/comfy-asset-kinds';
import type { ComfyModelAssetsViewModel } from '@/components/settings/comfy-model-assets/useComfyModelAssets';

type Props = Pick<
  ComfyModelAssetsViewModel,
  | 'forcedModelId'
  | 'filterCurrentModel'
  | 'setFilterCurrentModel'
  | 'missingOnly'
  | 'setMissingOnly'
  | 'searchQuery'
  | 'setSearchQuery'
  | 'loading'
  | 'load'
  | 'rootConfigured'
  | 'rootWritable'
  | 'downloadableMissing'
  | 'installMissingForModel'
  | 'kindFilter'
  | 'setKindFilter'
  | 'rows'
>;

export function ComfyModelAssetsFiltersBar({
  forcedModelId,
  filterCurrentModel,
  setFilterCurrentModel,
  missingOnly,
  setMissingOnly,
  searchQuery,
  setSearchQuery,
  loading,
  load,
  rootConfigured,
  rootWritable,
  downloadableMissing,
  installMissingForModel,
  kindFilter,
  setKindFilter,
  rows,
}: Props) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {forcedModelId ? null : (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={filterCurrentModel}
              onChange={event => setFilterCurrentModel(event.target.checked)}
            />
            Current model only
          </label>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={missingOnly}
            onChange={event => setMissingOnly(event.target.checked)}
          />
          Missing / manual only
        </label>
        <input
          type="search"
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
          placeholder="Search InstantX, ControlNet…"
          className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] shadow-inner transition focus-visible:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={loading}
          onClick={() => void load(true)}
        >
          Refresh
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={loading || !rootConfigured || !rootWritable || downloadableMissing === 0}
          onClick={() => void installMissingForModel()}
        >
          Install missing
          {forcedModelId || filterCurrentModel ? ' for model' : ''}
          {downloadableMissing > 0 ? ` (${downloadableMissing})` : ''}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <ChipButton active={kindFilter === 'all'} onClick={() => setKindFilter('all')}>
          All kinds
        </ChipButton>
        {COMFY_ASSET_KIND_ORDER.map(kind => {
          const count = rows.filter(row => row.kind === kind).length;
          if (count === 0) {
            return null;
          }
          return (
            <ChipButton key={kind} active={kindFilter === kind} onClick={() => setKindFilter(kind)}>
              {COMFY_ASSET_KIND_LABELS[kind]}
              <span className="opacity-60"> {count}</span>
            </ChipButton>
          );
        })}
      </div>
    </>
  );
}
