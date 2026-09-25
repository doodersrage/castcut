'use client';

import { ChipButton, FieldLabel, SelectInput } from '@/components/ui/Field';
import type { FittingClothingOption } from '@/lib/fitting-clothing-options';
import {
  countWardrobeOptionsForFilter,
  normalizeWardrobeCategoryFilter,
  wardrobeCategoryFilterOptions,
  type WardrobeCategoryFilter,
} from '@/lib/wardrobe-catalog-ui';

/** Clothing types most try-ons start from — one tap instead of a 12k-kit dropdown. */
const QUICK_CATEGORIES: ReadonlyArray<WardrobeCategoryFilter> = [
  'all',
  'outfit',
  'top',
  'bottom',
  'outerwear',
  'formalwear',
  'swimwear',
];

const QUICK_LABELS: Partial<Record<WardrobeCategoryFilter, string>> = {
  all: 'All',
  outfit: 'Full outfits',
  formalwear: 'Formal',
};

/**
 * Clothing type filter: quick-pick chips for the common types, "More types…" for the rest.
 * Chip titles carry the kit count so the row stays short.
 */
export default function WardrobeCategoryPicker({
  value,
  options,
  ready,
  disabled = false,
  onChange,
}: {
  value: WardrobeCategoryFilter;
  options: FittingClothingOption[];
  ready: boolean;
  disabled?: boolean;
  onChange: (next: WardrobeCategoryFilter) => void;
}) {
  const all = wardrobeCategoryFilterOptions();
  const labelFor = (filter: WardrobeCategoryFilter) =>
    QUICK_LABELS[filter] ?? all.find(option => option.value === filter)?.label ?? filter;
  const countFor = (filter: WardrobeCategoryFilter) =>
    ready ? countWardrobeOptionsForFilter(options, filter) : null;
  const more = all.filter(option => !QUICK_CATEGORIES.includes(option.value));
  const inMore = !QUICK_CATEGORIES.includes(value);

  return (
    <div className="space-y-2" data-testid="wardrobe-category-picker">
      <FieldLabel>Clothing type</FieldLabel>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Clothing type">
        {QUICK_CATEGORIES.map(filter => {
          const count = countFor(filter);
          return (
            <ChipButton
              key={filter}
              active={value === filter}
              disabled={disabled || !ready}
              data-testid={`wardrobe-category-${filter}`}
              title={count === null ? undefined : `${count} kit${count === 1 ? '' : 's'}`}
              onClick={() => onChange(filter)}
            >
              {labelFor(filter)}
            </ChipButton>
          );
        })}
        <SelectInput
          value={inMore ? value : ''}
          disabled={disabled || !ready}
          aria-label="More clothing types"
          data-testid="wardrobe-category-more"
          className={`w-auto! min-w-[9rem] ${inMore ? 'border-[var(--accent-border)]' : ''}`}
          onChange={event => {
            if (event.target.value) {
              onChange(normalizeWardrobeCategoryFilter(event.target.value));
            }
          }}
        >
          <option value="">More types…</option>
          {more.map(option => {
            const count = countFor(option.value);
            return (
              <option key={option.value} value={option.value}>
                {option.label}
                {count === null ? '' : ` (${count})`}
              </option>
            );
          })}
        </SelectInput>
      </div>
      {ready && value !== 'all' ? (
        <p className="type-caption text-[var(--text-muted)]">
          {countFor(value)} kit{countFor(value) === 1 ? '' : 's'} in {labelFor(value)}.
        </p>
      ) : null}
    </div>
  );
}
