import type { ComfyGalleryFilter, ComfyGallerySort } from './comfyui-gallery';

export type GalleryUrlState = {
  filter: Partial<ComfyGalleryFilter>;
  sort?: ComfyGallerySort;
  projectFilterId?: string;
  page?: number;
};

const SORT_VALUES: ComfyGallerySort[] = [
  'queued-desc',
  'queued-asc',
  'completed-desc',
  'tool-asc',
  'favorites-first',
  'rating-desc',
  'eviction-risk-desc',
  'play-match-desc',
];

function isSort(value: string | null): value is ComfyGallerySort {
  return Boolean(value && SORT_VALUES.includes(value as ComfyGallerySort));
}

function parseMinRating(value: string | null): ComfyGalleryFilter['minRating'] | undefined {
  if (!value) {
    return undefined;
  }
  const n = Number(value);
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) {
    return n;
  }
  return undefined;
}

function parsePage(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) {
    return undefined;
  }
  return Math.floor(n);
}

/** Read shareable gallery view params from the current URL (filter/sort/project/page). */
export function parseGalleryUrlState(params: URLSearchParams): GalleryUrlState {
  const filter: Partial<ComfyGalleryFilter> = {};
  const q = params.get('q')?.trim();
  if (q) {
    filter.query = q;
  }
  const focus = params.get('focus')?.trim();
  if (focus) {
    filter.focusEntryId = focus;
  }
  if (params.get('review') === '1') {
    filter.reviewMode = true;
    filter.unreviewedOnly = true;
  }
  if (params.get('unreviewed') === '1') {
    filter.unreviewedOnly = true;
    filter.reviewMode = true;
  }
  const status = params.get('status');
  if (
    status === 'pending' ||
    status === 'running' ||
    status === 'completed' ||
    status === 'error' ||
    status === 'all'
  ) {
    filter.status = status;
  }
  const tool = params.get('tool')?.trim();
  if (tool) {
    filter.tool = tool;
  }
  const model = params.get('model')?.trim();
  if (model) {
    filter.model = model;
  }
  const minRating = parseMinRating(params.get('minRating'));
  if (minRating) {
    filter.minRating = minRating;
  }
  if (params.get('fav') === '1') {
    filter.favoritesOnly = true;
  }
  if (params.get('atRisk') === '1') {
    filter.atRiskOnly = true;
  }
  if (params.get('missed') === '1') {
    filter.playCheckMissOnly = true;
  }
  const media = params.get('media');
  if (
    media === 'image' ||
    media === 'video' ||
    media === 'audio' ||
    media === 'mesh' ||
    media === 'all'
  ) {
    filter.mediaKind = media;
  }

  const sortRaw = params.get('sort');
  const sort = isSort(sortRaw) ? sortRaw : undefined;
  const project = params.get('project');
  const projectFilterId = project === null ? undefined : project;
  const page = parsePage(params.get('page'));

  if (params.get('semantic') === '1') {
    filter.semanticSearch = true;
  }
  const similar = params.get('similar')?.trim();
  if (similar) {
    filter.similarToEntryId = similar;
  }
  if (params.get('similarMode') === 'visual') {
    filter.similarMode = 'visual';
  }
  if (params.get('visionTags') === '1') {
    filter.visionTagsOnly = true;
  }
  if (params.get('duplicates') === '1') {
    filter.duplicatesOnly = true;
  }
  if (params.get('visionInbox') === '1') {
    filter.needsVisionReview = true;
  }
  const userTag = params.get('userTag')?.trim();
  if (userTag) {
    filter.userTag = userTag;
  }
  const customGroup = params.get('group')?.trim();
  if (customGroup) {
    filter.customGroup = customGroup;
  }
  const characterId = params.get('character')?.trim();
  if (characterId) {
    filter.characterId = characterId;
  }
  const derivedKind = params.get('derivedKind')?.trim();
  if (
    derivedKind === 'upscale' ||
    derivedKind === 'refine' ||
    derivedKind === 'soft-pass' ||
    derivedKind === 'variation' ||
    derivedKind === 'moire-clean' ||
    derivedKind === 'face-detail' ||
    derivedKind === 'controlnet' ||
    derivedKind === 'i2v' ||
    derivedKind === 't2v' ||
    derivedKind === 'extend' ||
    derivedKind === 'film'
  ) {
    filter.derivedKind = derivedKind;
  }

  return { filter, sort, projectFilterId, page };
}

/** Write shareable gallery view params (preserves unrelated query keys like lightbox/pickFor). */
export function applyGalleryUrlState(
  params: URLSearchParams,
  state: {
    filter: ComfyGalleryFilter;
    sort: ComfyGallerySort;
    projectFilterId: string;
    page: number;
  }
): void {
  const { filter, sort, projectFilterId, page } = state;

  const setOrDelete = (key: string, value: string | undefined) => {
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  };

  setOrDelete('q', filter.query?.trim() || undefined);
  setOrDelete('focus', filter.focusEntryId?.trim() || undefined);
  setOrDelete('review', filter.reviewMode ? '1' : undefined);
  setOrDelete('unreviewed', filter.unreviewedOnly && !filter.reviewMode ? '1' : undefined);
  setOrDelete('status', filter.status && filter.status !== 'all' ? filter.status : undefined);
  setOrDelete('tool', filter.tool?.trim() || undefined);
  setOrDelete('model', filter.model?.trim() || undefined);
  setOrDelete('minRating', filter.minRating ? String(filter.minRating) : undefined);
  setOrDelete('fav', filter.favoritesOnly ? '1' : undefined);
  setOrDelete('atRisk', filter.atRiskOnly ? '1' : undefined);
  setOrDelete('missed', filter.playCheckMissOnly ? '1' : undefined);
  setOrDelete(
    'media',
    filter.mediaKind && filter.mediaKind !== 'all' ? filter.mediaKind : undefined
  );
  setOrDelete('semantic', filter.semanticSearch ? '1' : undefined);
  setOrDelete('similar', filter.similarToEntryId?.trim() || undefined);
  setOrDelete('similarMode', filter.similarMode === 'visual' ? 'visual' : undefined);
  setOrDelete('visionTags', filter.visionTagsOnly ? '1' : undefined);
  setOrDelete('duplicates', filter.duplicatesOnly ? '1' : undefined);
  setOrDelete('visionInbox', filter.needsVisionReview ? '1' : undefined);
  setOrDelete('userTag', filter.userTag?.trim() || undefined);
  setOrDelete('group', filter.customGroup?.trim() || undefined);
  setOrDelete('derivedKind', filter.derivedKind || undefined);
  setOrDelete('character', filter.characterId?.trim() || undefined);
  setOrDelete('sort', sort !== 'queued-desc' ? sort : undefined);
  setOrDelete('project', projectFilterId.trim() || undefined);
  setOrDelete('page', page > 1 ? String(page) : undefined);
}
