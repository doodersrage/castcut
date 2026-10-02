'use client';

import type { FantasyPreset, FantasyPresetCategory } from '@/lib/fantasy-presets';
import { FANTASY_PRESET_CATEGORIES, fantasyPresetsForCategory } from '@/lib/fantasy-presets';

type FantasyPresetChipsProps = {
  selectedId?: string;
  onSelect: (preset: FantasyPreset) => void;
  category?: FantasyPresetCategory | 'all';
  onCategoryChange?: (category: FantasyPresetCategory | 'all') => void;
};

export default function FantasyPresetChips({
  selectedId,
  onSelect,
  category = 'all',
  onCategoryChange,
}: FantasyPresetChipsProps) {
  const presets = fantasyPresetsForCategory(category);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--text-primary)]">Fantasy presets</p>
        <p className="text-xs text-[var(--text-muted)]">{presets.length} scenes</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FANTASY_PRESET_CATEGORIES.map(item => (
          <button
            key={item.value}
            type="button"
            onClick={() => onCategoryChange?.(item.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition max-md:min-h-8 ${
              category === item.value
                ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map(preset => {
          const active = selectedId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelect(preset)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                  : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
