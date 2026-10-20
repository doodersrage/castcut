import { categoryLabel } from './clothing-catalog-fields';
import { WARDROBE_CATEGORIES, type ClothingCategory } from './clothing-catalog-fields';

export type WardrobeCategoryFilter = 'all' | ClothingCategory;

export type WardrobeSelectOption = {
  value: string;
  label: string;
  group?: string;
};

export function wardrobeCategoryFilterOptions(): Array<{
  value: WardrobeCategoryFilter;
  label: string;
}> {
  return [
    { value: 'all', label: 'All clothing types' },
    ...WARDROBE_CATEGORIES.map(category => ({
      value: category,
      label: categoryLabel(category),
    })),
  ];
}

export function normalizeWardrobeCategoryFilter(
  value: string | null | undefined
): WardrobeCategoryFilter {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed === 'all') {
    return 'all';
  }
  if ((WARDROBE_CATEGORIES as readonly string[]).includes(trimmed)) {
    return trimmed as ClothingCategory;
  }
  return 'all';
}

/** Filter wardrobe catalog select options by clothing category (group label). */
export function filterWardrobeSelectOptions(
  options: WardrobeSelectOption[],
  filter: WardrobeCategoryFilter,
  pinnedValue?: string
): WardrobeSelectOption[] {
  const pinned = pinnedValue?.trim();
  if (filter === 'all') {
    return options;
  }
  const group = categoryLabel(filter);
  const filtered = options.filter(option => !option.value || option.group === group);
  if (pinned && !filtered.some(option => option.value === pinned)) {
    const match = options.find(option => option.value === pinned);
    if (match) {
      filtered.push(match);
    }
  }
  return filtered;
}

export function countWardrobeOptionsForFilter(
  options: WardrobeSelectOption[],
  filter: WardrobeCategoryFilter
): number {
  return filterWardrobeSelectOptions(options, filter).filter(option => option.value).length;
}
