'use client';

import { useMemo, useState } from 'react';
import { accentFocusClass } from '@/components/ui/ToolPageShell';
import {
  filterComfyUiSettingsSections,
  type ComfyUiSettingsSectionId,
} from '@/lib/settings/comfyui-nav';

export default function ComfyUiSettingsJumpNav({
  activeSection,
  onJump,
  essentialsOnly = false,
}: {
  activeSection?: ComfyUiSettingsSectionId | null;
  onJump: (section: ComfyUiSettingsSectionId) => void;
  essentialsOnly?: boolean;
}) {
  const [query, setQuery] = useState('');
  const sections = useMemo(
    () => filterComfyUiSettingsSections(query, { essentialsOnly }),
    [essentialsOnly, query]
  );
  const fallbackSections = useMemo(
    () => filterComfyUiSettingsSections('', { essentialsOnly }),
    [essentialsOnly]
  );
  const options = sections.length ? sections : fallbackSections;

  return (
    <div className="ui-jump-nav space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-overline text-[var(--text-muted)]">Jump to</p>
          <p className="ui-meta mt-1">
            {essentialsOnly
              ? 'Essentials — engine, connection, model assets, and queue parameters.'
              : 'Search or jump: engines first, then ComfyUI connection and queue.'}
          </p>
        </div>
        <label className="block min-w-[12rem] flex-1 sm:max-w-xs">
          <span className="sr-only">Search ComfyUI settings sections</span>
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search sections…"
            className={`ui-input w-full text-sm ${accentFocusClass()}`}
          />
        </label>
      </div>
      <label className="block max-w-md space-y-1.5">
        <span className="type-caption text-[var(--text-muted)]">Section</span>
        <select
          value={activeSection ?? ''}
          onChange={event => {
            const next = event.target.value as ComfyUiSettingsSectionId;
            if (next) {
              onJump(next);
            }
          }}
          data-testid="comfyui-settings-jump-select"
          className={`ui-input block w-full px-3 py-(--input-padding-y) type-body ${accentFocusClass()}`}
        >
          <option value="">Choose a section…</option>
          {options.map(section => (
            <option key={section.id} value={section.id}>
              {section.label}
            </option>
          ))}
        </select>
      </label>
      {query.trim() && sections.length === 0 ? (
        <p className="type-caption text-[var(--text-muted)]">No sections match “{query.trim()}”.</p>
      ) : null}
    </div>
  );
}
