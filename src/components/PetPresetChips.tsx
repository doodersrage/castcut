'use client';

import { useMemo, useState } from 'react';
import {
  PET_PRESET_CATEGORIES,
  petPresetsForCategory,
  type PetPreset,
  type PetPresetCategory,
} from '@/lib/pet-presets';

type PetPresetChipsProps = {
  selectedId?: string;
  onSelect: (preset: PetPreset) => void;
  category?: PetPresetCategory | 'all';
  onCategoryChange?: (category: PetPresetCategory | 'all') => void;
};

export default function PetPresetChips({
  selectedId,
  onSelect,
  category = 'all',
  onCategoryChange,
}: PetPresetChipsProps) {
  const [localCategory, setLocalCategory] = useState<PetPresetCategory | 'all'>(category);
  const activeCategory = onCategoryChange ? category : localCategory;
  const presets = useMemo(() => petPresetsForCategory(activeCategory), [activeCategory]);

  const setCategory = (next: PetPresetCategory | 'all') => {
    if (onCategoryChange) {
      onCategoryChange(next);
      return;
    }
    setLocalCategory(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--text-primary)]">Pet presets</p>
        <p className="text-xs text-[var(--text-muted)]">{presets.length} scenes</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PET_PRESET_CATEGORIES.map(item => (
          <button
            key={item.value}
            type="button"
            onClick={() => setCategory(item.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition max-md:min-h-8 ${
              activeCategory === item.value
                ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
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
                  ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                  : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
              }`}
            >
              {preset.label}
              {preset.pair ? ' · pair' : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}
