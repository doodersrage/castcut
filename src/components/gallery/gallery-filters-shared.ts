import type { PromptProject } from '@/lib/prompt-projects';
import type { ComfyGalleryFilter, ComfyGallerySort } from '@/lib/comfyui-gallery';
import { GALLERY_UNGROUPED_FILTER } from '@/lib/gallery-custom-groups';
import { getCharacter } from '@/lib/character-os';

export const GALLERY_SORT_OPTIONS: { value: ComfyGallerySort; label: string }[] = [
  { value: 'queued-desc', label: 'Newest' },
  { value: 'queued-asc', label: 'Oldest' },
  { value: 'completed-desc', label: 'Recently done' },
  { value: 'tool-asc', label: 'Tool A–Z' },
  { value: 'favorites-first', label: 'Favorites' },
  { value: 'rating-desc', label: 'Highest rated' },
  { value: 'eviction-risk-desc', label: 'Eviction risk' },
  { value: 'play-match-desc', label: 'Best pose / face match' },
];

export type ActiveFilterChip = {
  key: string;
  label: string;
  clear: () => void;
};

export function buildActiveFilterChips({
  filter,
  projectFilterId,
  projects,
  sort,
  setFilter,
  setProjectFilterId,
  setSort,
}: {
  filter: ComfyGalleryFilter;
  projectFilterId: string;
  projects: PromptProject[];
  sort: ComfyGallerySort;
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>;
  setProjectFilterId: (value: string) => void;
  setSort: (value: ComfyGallerySort) => void;
}): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (filter.query?.trim()) {
    chips.push({
      key: 'query',
      label: `Search: ${filter.query.trim()}`,
      clear: () => setFilter(previous => ({ ...previous, query: undefined })),
    });
  }
  if (filter.status && filter.status !== 'all') {
    chips.push({
      key: 'status',
      label: `Status: ${filter.status}`,
      clear: () => setFilter(previous => ({ ...previous, status: 'all' })),
    });
  }
  if (filter.tool) {
    chips.push({
      key: 'tool',
      label: `Tool: ${filter.tool}`,
      clear: () => setFilter(previous => ({ ...previous, tool: undefined })),
    });
  }
  if (filter.playCheckMissOnly) {
    chips.push({
      key: 'playCheckMiss',
      label: 'Missed pose / face',
      clear: () => setFilter(previous => ({ ...previous, playCheckMissOnly: undefined })),
    });
  }
  if (filter.characterId?.trim()) {
    const castId = filter.characterId.trim();
    chips.push({
      key: 'cast',
      label: `Cast: ${getCharacter(castId)?.name?.trim() || castId}`,
      clear: () => setFilter(previous => ({ ...previous, characterId: undefined })),
    });
  }
  if (filter.model) {
    chips.push({
      key: 'model',
      label: `Model: ${filter.model}`,
      clear: () => setFilter(previous => ({ ...previous, model: undefined })),
    });
  }
  if (filter.minRating) {
    chips.push({
      key: 'minRating',
      label: `≥${filter.minRating}★`,
      clear: () => setFilter(previous => ({ ...previous, minRating: undefined })),
    });
  }
  if (filter.favoritesOnly) {
    chips.push({
      key: 'fav',
      label: 'Favorites',
      clear: () => setFilter(previous => ({ ...previous, favoritesOnly: undefined })),
    });
  }
  if (filter.atRiskOnly) {
    chips.push({
      key: 'atRisk',
      label: 'At risk',
      clear: () => setFilter(previous => ({ ...previous, atRiskOnly: undefined })),
    });
  }
  if (filter.duplicatesOnly) {
    chips.push({
      key: 'duplicates',
      label: 'Duplicates',
      clear: () => setFilter(previous => ({ ...previous, duplicatesOnly: undefined })),
    });
  }
  if (filter.needsVisionReview) {
    chips.push({
      key: 'visionInbox',
      label: 'Vision inbox',
      clear: () => setFilter(previous => ({ ...previous, needsVisionReview: undefined })),
    });
  }
  if (filter.userTag) {
    chips.push({
      key: 'userTag',
      label: `#${filter.userTag}`,
      clear: () => setFilter(previous => ({ ...previous, userTag: undefined })),
    });
  }
  if (filter.customGroup) {
    chips.push({
      key: 'customGroup',
      label:
        filter.customGroup === GALLERY_UNGROUPED_FILTER
          ? 'Ungrouped'
          : `Group: ${filter.customGroup}`,
      clear: () => setFilter(previous => ({ ...previous, customGroup: undefined })),
    });
  }
  if (filter.similarToEntryId) {
    chips.push({
      key: 'similar',
      label: filter.similarMode === 'visual' ? 'Looks like this' : 'Similar',
      clear: () =>
        setFilter(previous => ({
          ...previous,
          similarToEntryId: undefined,
          similarMode: undefined,
        })),
    });
  }
  if (filter.derivedKind) {
    chips.push({
      key: 'derivedKind',
      label: `Derived: ${filter.derivedKind}`,
      clear: () => setFilter(previous => ({ ...previous, derivedKind: undefined })),
    });
  }
  if (filter.reviewMode) {
    chips.push({
      key: 'review',
      label: 'Review',
      clear: () =>
        setFilter(previous => ({
          ...previous,
          reviewMode: undefined,
          unreviewedOnly: undefined,
          reviewAutoAdvance: undefined,
        })),
    });
  } else if (filter.unreviewedOnly) {
    chips.push({
      key: 'unreviewed',
      label: 'Unreviewed',
      clear: () => setFilter(previous => ({ ...previous, unreviewedOnly: undefined })),
    });
  }
  if (filter.mediaKind && filter.mediaKind !== 'all') {
    chips.push({
      key: 'media',
      label:
        filter.mediaKind === 'image'
          ? 'Stills'
          : filter.mediaKind === 'video'
            ? 'Videos'
            : filter.mediaKind === 'audio'
              ? 'Audio'
              : '3D',
      clear: () => setFilter(previous => ({ ...previous, mediaKind: 'all' })),
    });
  }
  if (filter.visionTagsOnly) {
    chips.push({
      key: 'vision',
      label: 'Vision tags',
      clear: () => setFilter(previous => ({ ...previous, visionTagsOnly: undefined })),
    });
  }
  if (filter.semanticSearch) {
    chips.push({
      key: 'semantic',
      label: 'Semantic',
      clear: () => setFilter(previous => ({ ...previous, semanticSearch: undefined })),
    });
  }
  if (projectFilterId) {
    const projectLabel =
      projectFilterId === 'active'
        ? 'Active project'
        : (projects.find(project => project.id === projectFilterId)?.name ?? projectFilterId);
    chips.push({
      key: 'project',
      label: `Project: ${projectLabel}`,
      clear: () => setProjectFilterId(''),
    });
  }
  if (sort !== 'queued-desc') {
    const sortLabel = GALLERY_SORT_OPTIONS.find(option => option.value === sort)?.label ?? sort;
    chips.push({
      key: 'sort',
      label: `Sort: ${sortLabel}`,
      clear: () => setSort('queued-desc'),
    });
  }
  return chips;
}

export function clearAllGalleryFilters(
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>,
  setProjectFilterId: (value: string) => void,
  setSort: (value: ComfyGallerySort) => void
) {
  setFilter({
    status: 'all',
    favoritesOnly: undefined,
    tool: undefined,
    model: undefined,
    minRating: undefined,
    query: undefined,
    semanticSearch: undefined,
    reviewMode: undefined,
    unreviewedOnly: undefined,
    reviewAutoAdvance: undefined,
    visionTagsOnly: undefined,
    atRiskOnly: undefined,
    mediaKind: 'all',
    similarToEntryId: undefined,
    focusEntryId: undefined,
    derivativeOfEntryId: undefined,
    derivedKind: undefined,
    userTag: undefined,
    customGroup: undefined,
  });
  setProjectFilterId('');
  setSort('queued-desc');
}
